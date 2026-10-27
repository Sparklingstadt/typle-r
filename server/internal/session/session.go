// Package session signs and checks the cookies and tokens of the Go server: the login session, the short-lived OAuth
// state that lives between redirecting to GitHub or FFPF ID and coming back, and for the iPad app the one-time code its login
// ends with and the token it then signs in with. Each is base64url(JSON) + "." + base64url(HMAC-SHA256), and the HMAC
// key is derived from AUTH_SECRET, with a different key for each kind, so one kind never opens as another. The end-to-end tests forge a session with the TypeScript twin of Seal (tests/e2e/sessionCookie.ts), so
// the JSON field order and the key derivation here must not change without changing it too.
package session

import (
	"bytes"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

const (
	// MaxAge is how long a session is valid after it is issued.
	MaxAge = 30 * 24 * time.Hour
	// OAuthMaxAge is how long a login may take between leaving for GitHub and coming back.
	OAuthMaxAge = 10 * time.Minute
	// OAuthCookie is the name of the OAuth state cookie.
	OAuthCookie = "typle-oauth"
	// AppCodeMaxAge is how long the iPad app has to trade the code of its login for a token.
	AppCodeMaxAge = 2 * time.Minute

	// A session is sealed again once it is this old, so an active user stays signed in while MaxAge bounds an idle one.
	renewAfter = 24 * time.Hour

	sessionInfo = "typle session v1"
	oauthInfo   = "typle oauth v1"
	appInfo     = "typle app session v1"
	codeInfo    = "typle app code v1"
)

// accountSub is the only subject accepted: a GitHub account (the numeric user id, as the Next.js login used to give) or
// an FFPF ID account (its lowercase alphanumeric sub). The prefix keeps the two id spaces from ever colliding.
var accountSub = regexp.MustCompile(`^(github:\d+|ffpf:[a-z0-9]{1,64})$`)

// Session is a signed-in user. Times are kept in whole seconds.
type Session struct {
	Sub, Name, Image  string
	IssuedAt, Expires time.Time
}

// OAuth is the state of one login in progress: the PKCE verifier and where to go afterwards. Challenge is the iPad
// app's own PKCE challenge when the app started the login, and empty for the web app's. Provider is "ffpf" for a login
// through FFPF ID and empty for GitHub, so a callback can refuse a cookie that another provider's login started. Nonce
// is the OpenID Connect nonce that FFPF ID's ID token must echo, and empty for GitHub.
type OAuth struct {
	State, Verifier, ReturnTo, Challenge string
	Provider, Nonce                      string
	Expires                              time.Time
}

// AppCode is the end of a login the iPad app started: who signed in, for the app that holds the verifier of Challenge.
type AppCode struct {
	Sub, Name, Image, Challenge string
	Expires                     time.Time
}

// Field order is the order of the JSON, and the bytes are signed, so it is also what the TypeScript side must build.
type sessionWire struct {
	Sub   string `json:"sub"`
	Name  string `json:"name"`
	Image string `json:"image"`
	Iat   int64  `json:"iat"`
	Exp   int64  `json:"exp"`
}

type oauthWire struct {
	State    string `json:"state"`
	Verifier string `json:"verifier"`
	ReturnTo string `json:"returnTo"`
	Exp      int64  `json:"exp"`
	// Left out for the web app's login, whose cookie thus stays as it was.
	Challenge string `json:"challenge,omitempty"`
	// Likewise left out for GitHub, after Challenge so that the bytes before them do not move.
	Provider string `json:"provider,omitempty"`
	Nonce    string `json:"nonce,omitempty"`
}

type codeWire struct {
	Sub       string `json:"sub"`
	Name      string `json:"name"`
	Image     string `json:"image"`
	Challenge string `json:"challenge"`
	Exp       int64  `json:"exp"`
}

// Keys holds the signing key of each kind of cookie. The zero Keys has no keys: its Open and OpenOAuth refuse every
// cookie, and its Seal and SealOAuth panic, because HMAC with an empty key is a signature anyone can make, and using
// Keys that NewKeys never returned is a programming error that must not pass quietly.
type Keys struct {
	session, oauth, app, code []byte
}

// NewKeys derives the keys from AUTH_SECRET. An empty secret would make every cookie forgeable, so it is refused.
func NewKeys(secret string) (Keys, error) {
	if secret == "" {
		return Keys{}, errors.New("AUTH_SECRET is empty")
	}
	sessionKey, err := hkdf.Key(sha256.New, []byte(secret), nil, sessionInfo, sha256.Size)
	if err != nil {
		return Keys{}, err
	}
	oauthKey, err := hkdf.Key(sha256.New, []byte(secret), nil, oauthInfo, sha256.Size)
	if err != nil {
		return Keys{}, err
	}
	appKey, err := hkdf.Key(sha256.New, []byte(secret), nil, appInfo, sha256.Size)
	if err != nil {
		return Keys{}, err
	}
	codeKey, err := hkdf.Key(sha256.New, []byte(secret), nil, codeInfo, sha256.Size)
	if err != nil {
		return Keys{}, err
	}
	return Keys{session: sessionKey, oauth: oauthKey, app: appKey, code: codeKey}, nil
}

// New starts a session at now.
func New(sub, name, image string, now time.Time) Session {
	now = now.Truncate(time.Second)
	return Session{Sub: sub, Name: name, Image: image, IssuedAt: now, Expires: now.Add(MaxAge)}
}

// NeedsRenewal reports whether the session is old enough to be issued again.
func (s Session) NeedsRenewal(now time.Time) bool {
	return now.Sub(s.IssuedAt) >= renewAfter
}

// CookieName is __Host- over HTTPS, which makes the browser insist on Secure, Path=/ and no Domain; plain HTTP
// (local development) cannot set such a cookie.
func CookieName(secure bool) string {
	if secure {
		return "__Host-typle-session"
	}
	return "typle-session"
}

// Seal signs s. It does not check s: Open does. It panics on the zero Keys.
func (k Keys) Seal(s Session) string {
	return seal(k.session, sessionWire{s.Sub, s.Name, s.Image, s.IssuedAt.Unix(), s.Expires.Unix()})
}

// Open returns the session in value if it is ours, unexpired and for a GitHub or FFPF ID account.
func (k Keys) Open(value string, now time.Time) (Session, bool) {
	return openSession(k.session, value, now)
}

// SealApp signs s as the iPad app's token, which it sends as a bearer token instead of the cookie. It panics on the
// zero Keys.
func (k Keys) SealApp(s Session) string {
	return seal(k.app, sessionWire{s.Sub, s.Name, s.Image, s.IssuedAt.Unix(), s.Expires.Unix()})
}

// OpenApp returns the session in the iPad app's token value, as Open does for a cookie.
func (k Keys) OpenApp(value string, now time.Time) (Session, bool) {
	return openSession(k.app, value, now)
}

func openSession(key []byte, value string, now time.Time) (Session, bool) {
	var w sessionWire
	if !open(key, value, &w) || !now.Before(time.Unix(w.Exp, 0)) || !accountSub.MatchString(w.Sub) {
		return Session{}, false
	}
	return Session{w.Sub, w.Name, w.Image, time.Unix(w.Iat, 0), time.Unix(w.Exp, 0)}, true
}

// SealOAuth signs o with the OAuth key. It panics on the zero Keys.
func (k Keys) SealOAuth(o OAuth) string {
	return seal(k.oauth, oauthWire{o.State, o.Verifier, o.ReturnTo, o.Expires.Unix(), o.Challenge, o.Provider, o.Nonce})
}

// OpenOAuth returns the login state in value if it is ours and unexpired.
func (k Keys) OpenOAuth(value string, now time.Time) (OAuth, bool) {
	var w oauthWire
	if !open(k.oauth, value, &w) || !now.Before(time.Unix(w.Exp, 0)) {
		return OAuth{}, false
	}
	return OAuth{w.State, w.Verifier, w.ReturnTo, w.Challenge, w.Provider, w.Nonce, time.Unix(w.Exp, 0)}, true
}

// SealCode signs c with the code key. It panics on the zero Keys.
func (k Keys) SealCode(c AppCode) string {
	return seal(k.code, codeWire{c.Sub, c.Name, c.Image, c.Challenge, c.Expires.Unix()})
}

// OpenCode returns the code in value if it is ours, unexpired and for a GitHub or FFPF ID account. It does not check the
// verifier: the caller compares it with Challenge.
func (k Keys) OpenCode(value string, now time.Time) (AppCode, bool) {
	var w codeWire
	if !open(k.code, value, &w) || !now.Before(time.Unix(w.Exp, 0)) || !accountSub.MatchString(w.Sub) || w.Challenge == "" {
		return AppCode{}, false
	}
	return AppCode{w.Sub, w.Name, w.Image, w.Challenge, time.Unix(w.Exp, 0)}, true
}

func seal(key []byte, v any) string {
	if len(key) == 0 {
		panic("session: sealing with an empty key")
	}
	payload := base64.RawURLEncoding.EncodeToString(encode(v))
	return payload + "." + base64.RawURLEncoding.EncodeToString(sign(key, payload))
}

// encode writes the JSON as the TypeScript twin's JSON.stringify does, so that both sign the same bytes: & < > are
// written as they are. The encoder still writes U+2028 and U+2029 as \u2028 and \u2029, which JSON.stringify does not,
// so the twin replaces those two after stringify. Open signs the payload as received and only then reads it as JSON,
// so cookies sealed with json.Marshal (& < > as \u0026 \u003c \u003e) still open.
func encode(v any) []byte {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	// The wire structs hold only strings and integers, which always encode.
	_ = encoder.Encode(v)
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n"))
}

func open(key []byte, value string, v any) bool {
	payload, signature, ok := strings.Cut(value, ".")
	if !ok || len(key) == 0 {
		return false
	}
	// Strict, so one signature has one spelling.
	got, err := base64.RawURLEncoding.Strict().DecodeString(signature)
	if err != nil || !hmac.Equal(got, sign(key, payload)) {
		return false
	}
	data, err := base64.RawURLEncoding.Strict().DecodeString(payload)
	return err == nil && json.Unmarshal(data, v) == nil
}

func sign(key []byte, payload string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	return mac.Sum(nil)
}
