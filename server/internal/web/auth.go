package web

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/session"
)

const (
	callbackPath = "/api/auth/callback/github"
	// authPath is where the OAuth cookie lives: only the login endpoints are sent it.
	authPath   = "/api/auth"
	defaultTo  = "/home"
	localSub   = "github:0"
	localName  = "ローカル練習用"
	randomSize = 32
	// maxReturnTo keeps the OAuth cookie, which holds returnTo, well under the 4096 bytes a browser accepts.
	maxReturnTo = 1024
	// appClient is the signin's client for a login the iPad app starts, and appReturn where such a login ends: the
	// app's ASWebAuthenticationSession waits for this scheme and gives the URL to the app alone.
	appClient = "ipad"
	appReturn = "typle-r://login"
	// maxTokenRequest is far more than a code and a verifier take.
	maxTokenRequest = 4096
)

// pkceValue is what RFC 7636 allows as a code verifier; an S256 challenge is 43 of these characters.
var (
	pkceValue     = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
	pkceChallenge = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
)

// challengeOf is the S256 code challenge of verifier.
func challengeOf(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// toApp ends a login the iPad app started, with the code or the error.
func toApp(w http.ResponseWriter, key, value string) {
	goTo(w, appReturn+"?"+url.Values{key: {value}}.Encode())
}

// safeReturnTo is where to go back to after the login: a path of this site. Anything else, such as another site, a
// protocol-relative URL (//host) or one a browser reads as such (/\host), or one over maxReturnTo bytes, is /home.
func safeReturnTo(value string) string {
	if len(value) < 1 || len(value) > maxReturnTo || value[0] != '/' || (len(value) > 1 && (value[1] == '/' || value[1] == '\\')) {
		return defaultTo
	}
	// Parsing also refuses control characters, which have no place in a Location.
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || parsed.User != nil {
		return defaultTo
	}
	return value
}

// redirectURI is where GitHub sends the browser back to; it is the callback URL of the OAuth App.
func (s *server) redirectURI() string {
	base := s.config.BaseURL
	return (&url.URL{Scheme: base.Scheme, Host: base.Host, Path: strings.TrimSuffix(base.Path, "/") + callbackPath}).String()
}

func (s *server) secure() bool {
	return s.config.BaseURL != nil && s.config.BaseURL.Scheme == "https"
}

// loginReady reports whether the login can run, and otherwise answers 503 and logs why. It is only logged, not
// reported: a missing setting would otherwise send an error to the tracker with every request.
func (s *server) loginReady(w http.ResponseWriter, r *http.Request) bool {
	if s.config.OAuth == nil || s.config.GitHub == nil || s.config.BaseURL == nil {
		log.Printf("%s %s: the login is not configured", r.Method, r.URL.Path)
		refuse(w, http.StatusServiceUnavailable, "authUnavailable")
		return false
	}
	return true
}

// methods lets only the listed methods through. The login steps list GET alone: they set cookies and call GitHub, which
// a HEAD must not do.
func methods(w http.ResponseWriter, r *http.Request, allow ...string) bool {
	for _, method := range allow {
		if r.Method == method {
			return true
		}
	}
	w.Header().Set("Allow", strings.Join(allow, ", "))
	refuse(w, http.StatusMethodNotAllowed, "methodNotAllowed")
	return false
}

func (s *server) sessionCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name: session.CookieName(s.secure()), Value: value, Path: "/", MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure(),
	}
}

// issue signs the session in. The cookie holds only what the screen shows, not GitHub's token.
func (s *server) issue(w http.ResponseWriter, sub, name, image string) {
	value := s.config.Keys.Seal(session.New(sub, name, image, s.now()))
	http.SetCookie(w, s.sessionCookie(value, int(session.MaxAge.Seconds())))
}

func (s *server) oauthCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name: session.OAuthCookie, Value: value, Path: authPath, MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure(),
	}
}

// goTo redirects the browser; a redirect is not kept by a cache, as it may set a cookie.
func goTo(w http.ResponseWriter, location string) {
	w.Header().Set("Location", location)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusFound)
}

func random() (string, error) {
	bytes := make([]byte, randomSize)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// signin sends the browser to GitHub with a state and a PKCE challenge, and keeps the state, the verifier and where to
// return to in the signed OAuth cookie. With client=ipad and the app's own S256 code_challenge, the login is the iPad
// app's: it ends at appReturn with a code that only the holder of the challenge's verifier can trade for a token.
func (s *server) signin(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet) || !s.loginReady(w, r) {
		return
	}
	query := r.URL.Query()
	var appChallenge string
	if query.Get("client") == appClient {
		if appChallenge = query.Get("code_challenge"); !pkceChallenge.MatchString(appChallenge) {
			toApp(w, "error", "loginFailed")
			return
		}
	}
	state, err := random()
	var verifier string
	if err == nil {
		verifier, err = random()
	}
	if err != nil {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		refuse(w, http.StatusServiceUnavailable, "authUnavailable")
		return
	}
	value := s.config.Keys.SealOAuth(session.OAuth{
		State: state, Verifier: verifier, ReturnTo: safeReturnTo(query.Get("returnTo")), Challenge: appChallenge,
		Expires: s.now().Add(session.OAuthMaxAge),
	})
	http.SetCookie(w, s.oauthCookie(value, int(session.OAuthMaxAge.Seconds())))
	goTo(w, s.config.OAuth.AuthorizeURL(state, challengeOf(verifier), s.redirectURI()))
}

// callback is where GitHub sends the browser back to. Whatever happens, the OAuth cookie is spent and the browser goes
// back to the page it left, signed in only if everything checked out. Errors are not shown: the screen has no page for
// a failed login, and what GitHub says is not for the reader. A login the iPad app started goes back to the app
// instead, with a code for it to trade for a token, or loginFailed; no cookie is set.
func (s *server) callback(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet) || !s.loginReady(w, r) {
		return
	}
	http.SetCookie(w, s.oauthCookie("", -1))
	returnTo := defaultTo
	var pending session.OAuth
	opened := false
	if cookie, err := r.Cookie(session.OAuthCookie); err == nil {
		if pending, opened = s.config.Keys.OpenOAuth(cookie.Value, s.now()); opened {
			returnTo = safeReturnTo(pending.ReturnTo)
		}
	}
	app := opened && pending.Challenge != ""
	fail := func() {
		if app {
			toApp(w, "error", "loginFailed")
		} else {
			goTo(w, returnTo)
		}
	}
	query := r.URL.Query()
	state, code := query.Get("state"), query.Get("code")
	if !opened || query.Get("error") != "" || state == "" || code == "" ||
		subtle.ConstantTimeCompare([]byte(state), []byte(pending.State)) != 1 {
		fail()
		return
	}
	token, err := s.config.OAuth.Exchange(r.Context(), code, pending.Verifier, s.redirectURI())
	if err != nil {
		s.report(r, err, "auth.callback")
		fail()
		return
	}
	user, err := s.config.GitHub.User(r.Context(), token)
	if err != nil {
		s.report(r, err, "auth.callback")
		fail()
		return
	}
	name := strings.TrimSpace(user.DisplayName())
	if app {
		toApp(w, "code", s.config.Keys.SealCode(session.AppCode{
			Sub: user.Account(), Name: name, Image: user.AvatarURL, Challenge: pending.Challenge,
			Expires: s.now().Add(session.AppCodeMaxAge),
		}))
		return
	}
	s.issue(w, user.Account(), name, user.AvatarURL)
	goTo(w, returnTo)
}

// tokenAnswer is the iPad app's token and who it signs in.
type tokenAnswer struct {
	Token string       `json:"token"`
	User  *sessionUser `json:"user"`
}

func userOf(s session.Session) *sessionUser {
	body := &sessionUser{ID: s.Sub, Name: s.Name}
	if s.Image != "" {
		body.Image = &s.Image
	}
	return body
}

// token trades the code a login of the iPad app ended with, and the verifier of its challenge, for the app's token. It
// takes no cookie and sets none, so it needs no Origin: only the app that started the login knows the verifier. Any
// mistake is loginFailed, and the app starts the login again.
func (s *server) token(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	var body struct {
		Code     string `json:"code"`
		Verifier string `json:"verifier"`
	}
	data, err := readLimited(r.Body, maxTokenRequest)
	if err != nil || json.Unmarshal(data, &body) != nil || !pkceValue.MatchString(body.Verifier) {
		refuse(w, http.StatusBadRequest, "loginFailed")
		return
	}
	code, ok := s.config.Keys.OpenCode(body.Code, s.now())
	if !ok || subtle.ConstantTimeCompare([]byte(challengeOf(body.Verifier)), []byte(code.Challenge)) != 1 {
		refuse(w, http.StatusBadRequest, "loginFailed")
		return
	}
	signedIn := session.New(code.Sub, code.Name, code.Image, s.now())
	reply(w, http.StatusOK, tokenAnswer{Token: s.config.Keys.SealApp(signedIn), User: userOf(signedIn)})
}

// sessionUser is the signed-in user as the screen sees them. The image is null when there is none.
type sessionUser struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Image *string `json:"image"`
}

// sessionAnswer is who is signed in, and for the iPad app the token to use from now on when its own has grown old.
type sessionAnswer struct {
	User  *sessionUser `json:"user"`
	Token string       `json:"token,omitempty"`
}

// session says who is signed in. A session that has grown old is signed again, so an active user stays signed in: a
// cookie is set again, and the iPad app is given a new token.
func (s *server) session(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	user, ok := s.owner(r)
	if !ok {
		reply(w, http.StatusOK, sessionAnswer{})
		return
	}
	var answer sessionAnswer
	if user.NeedsRenewal(s.now()) {
		if fromApp(r) {
			answer.Token = s.config.Keys.SealApp(session.New(user.Sub, user.Name, user.Image, s.now()))
		} else {
			s.issue(w, user.Sub, user.Name, user.Image)
		}
	}
	answer.User = userOf(user)
	reply(w, http.StatusOK, answer)
}

// signout forgets the session in the browser. The session is only a signed cookie, so there is nothing to revoke.
func (s *server) signout(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	if !s.sameOrigin(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	http.SetCookie(w, s.sessionCookie("", -1))
	noContent(w)
}

// localLogin signs in as a made-up account, for practice on a development machine. It is off unless Config.LocalLogin.
func (s *server) localLogin(w http.ResponseWriter, r *http.Request) {
	if !s.config.LocalLogin {
		refuse(w, http.StatusNotFound, "notFound")
		return
	}
	if !methods(w, r, http.MethodPost) {
		return
	}
	if !s.sameOrigin(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	s.issue(w, localSub, localName, "")
	noContent(w)
}

func noContent(w http.ResponseWriter) {
	header := w.Header()
	header.Set("Cache-Control", "private, no-store")
	header.Set("Vary", "Cookie")
	w.WriteHeader(http.StatusNoContent)
}
