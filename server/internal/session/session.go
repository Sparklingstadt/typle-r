// Package session signs and checks the cookies of the Go server: the login session and the short-lived OAuth state
// that lives between redirecting to GitHub and coming back. A cookie is base64url(JSON) + "." + base64url(HMAC-SHA256),
// and the HMAC key is derived from AUTH_SECRET, with a different key for each kind of cookie, so one kind never opens
// as the other. The end-to-end tests forge a session with the TypeScript twin of Seal (tests/e2e/sessionCookie.ts), so
// the JSON field order and the key derivation here must not change without changing it too.
package session

import (
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

	// A session is sealed again once it is this old, so an active user stays signed in while MaxAge bounds an idle one.
	renewAfter = 24 * time.Hour

	sessionInfo = "typle session v1"
	oauthInfo   = "typle oauth v1"
)

// accountSub is the only subject accepted: the numeric GitHub user id, as the Next.js login used to give.
var accountSub = regexp.MustCompile(`^github:\d+$`)

// Session is a signed-in user. Times are kept in whole seconds.
type Session struct {
	Sub, Name, Image  string
	IssuedAt, Expires time.Time
}

// OAuth is the state of one login in progress: the PKCE verifier and where to go afterwards.
type OAuth struct {
	State, Verifier, ReturnTo string
	Expires                   time.Time
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
}

// Keys holds the signing key of each kind of cookie. The zero Keys has no keys: its Open and OpenOAuth refuse every
// cookie, and its Seal and SealOAuth panic, because HMAC with an empty key is a signature anyone can make, and using
// Keys that NewKeys never returned is a programming error that must not pass quietly.
type Keys struct {
	session, oauth []byte
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
	return Keys{session: sessionKey, oauth: oauthKey}, nil
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

// Open returns the session in value if it is ours, unexpired and for a GitHub account.
func (k Keys) Open(value string, now time.Time) (Session, bool) {
	var w sessionWire
	if !open(k.session, value, &w) || !now.Before(time.Unix(w.Exp, 0)) || !accountSub.MatchString(w.Sub) {
		return Session{}, false
	}
	return Session{w.Sub, w.Name, w.Image, time.Unix(w.Iat, 0), time.Unix(w.Exp, 0)}, true
}

// SealOAuth signs o with the OAuth key. It panics on the zero Keys.
func (k Keys) SealOAuth(o OAuth) string {
	return seal(k.oauth, oauthWire{o.State, o.Verifier, o.ReturnTo, o.Expires.Unix()})
}

// OpenOAuth returns the login state in value if it is ours and unexpired.
func (k Keys) OpenOAuth(value string, now time.Time) (OAuth, bool) {
	var w oauthWire
	if !open(k.oauth, value, &w) || !now.Before(time.Unix(w.Exp, 0)) {
		return OAuth{}, false
	}
	return OAuth{w.State, w.Verifier, w.ReturnTo, time.Unix(w.Exp, 0)}, true
}

func seal(key []byte, v any) string {
	if len(key) == 0 {
		panic("session: sealing with an empty key")
	}
	// The wire structs hold only strings and integers, which always encode.
	data, _ := json.Marshal(v)
	payload := base64.RawURLEncoding.EncodeToString(data)
	return payload + "." + base64.RawURLEncoding.EncodeToString(sign(key, payload))
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
