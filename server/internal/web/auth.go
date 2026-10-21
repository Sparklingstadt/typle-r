package web

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
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
)

// safeReturnTo is where to go back to after the login: a path of this site. Anything else, such as another site, a
// protocol-relative URL (//host) or one a browser reads as such (/\host), is /home.
func safeReturnTo(value string) string {
	if len(value) < 1 || value[0] != '/' || (len(value) > 1 && (value[1] == '/' || value[1] == '\\')) {
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

// loginReady reports whether the login can run, and otherwise answers 503 with the reason in the log.
func (s *server) loginReady(w http.ResponseWriter, r *http.Request) bool {
	if s.config.OAuth == nil || s.config.GitHub == nil || s.config.BaseURL == nil {
		s.report(r, errors.New("the login is not configured"), "auth.config")
		refuse(w, http.StatusServiceUnavailable, "loginUnavailable")
		return false
	}
	return true
}

// methods lets only the listed methods through; GET also serves HEAD, as net/http leaves the body out.
func methods(w http.ResponseWriter, r *http.Request, allow string) bool {
	switch {
	case r.Method == allow, allow == http.MethodGet && r.Method == http.MethodHead:
		return true
	case allow == http.MethodGet:
		w.Header().Set("Allow", "GET, HEAD")
	default:
		w.Header().Set("Allow", allow)
	}
	failure(w, http.StatusMethodNotAllowed, "methodNotAllowed")
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
// return to in the signed OAuth cookie.
func (s *server) signin(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet) || !s.loginReady(w, r) {
		return
	}
	state, err := random()
	var verifier string
	if err == nil {
		verifier, err = random()
	}
	if err != nil {
		s.report(r, err, "auth.signin")
		refuse(w, http.StatusServiceUnavailable, "loginUnavailable")
		return
	}
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	value := s.config.Keys.SealOAuth(session.OAuth{
		State: state, Verifier: verifier, ReturnTo: safeReturnTo(r.URL.Query().Get("returnTo")),
		Expires: s.now().Add(session.OAuthMaxAge),
	})
	http.SetCookie(w, s.oauthCookie(value, int(session.OAuthMaxAge.Seconds())))
	goTo(w, s.config.OAuth.AuthorizeURL(state, challenge, s.redirectURI()))
}

// callback is where GitHub sends the browser back to. Whatever happens, the OAuth cookie is spent and the browser goes
// back to the page it left, signed in only if everything checked out. Errors are not shown: the screen has no page for
// a failed login, and what GitHub says is not for the reader.
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
	query := r.URL.Query()
	state, code := query.Get("state"), query.Get("code")
	if !opened || query.Get("error") != "" || state == "" || code == "" ||
		subtle.ConstantTimeCompare([]byte(state), []byte(pending.State)) != 1 {
		goTo(w, returnTo)
		return
	}
	token, err := s.config.OAuth.Exchange(r.Context(), code, pending.Verifier, s.redirectURI())
	if err != nil {
		s.report(r, err, "auth.callback")
		goTo(w, returnTo)
		return
	}
	user, err := s.config.GitHub.User(r.Context(), token)
	if err != nil {
		s.report(r, err, "auth.callback")
		goTo(w, returnTo)
		return
	}
	s.issue(w, user.Account(), strings.TrimSpace(user.DisplayName()), user.AvatarURL)
	goTo(w, returnTo)
}

// sessionUser is the signed-in user as the screen sees them. The image is null when there is none.
type sessionUser struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Image *string `json:"image"`
}

// session says who is signed in. A session that has grown old is signed again, so an active user stays signed in.
func (s *server) session(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet) {
		return
	}
	user, ok := s.owner(r)
	if !ok {
		reply(w, http.StatusOK, map[string]*sessionUser{"user": nil})
		return
	}
	if user.NeedsRenewal(s.now()) {
		s.issue(w, user.Sub, user.Name, user.Image)
	}
	body := &sessionUser{ID: user.Sub, Name: user.Name}
	if user.Image != "" {
		body.Image = &user.Image
	}
	reply(w, http.StatusOK, map[string]*sessionUser{"user": body})
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
		failure(w, http.StatusNotFound, "notFound")
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
