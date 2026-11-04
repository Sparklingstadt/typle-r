package web

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
)

const (
	githubCallback = "/api/auth/callback/github"
	ffpfCallback   = "/api/auth/callback/ffpf"
	// The providers, as signin's provider= and /api/auth/session's providers name them. A GitHub login keeps an empty
	// Provider in its OAuth cookie, so that the cookie is the same as before FFPF ID was added.
	providerGitHub = "github"
	providerFFPF   = "ffpf"
	// authPath is where the OAuth cookie lives: only the login endpoints are sent it.
	authPath   = "/api/auth"
	defaultTo  = "/home"
	localSub   = "github:0"
	localName  = "ローカル練習用"
	randomSize = 32
	// maxReturnTo keeps the OAuth cookie, which holds returnTo, well under the 4096 bytes a browser accepts.
	maxReturnTo = 1024
	// reloginCookie marks a browser that signed out: its next login with FFPF ID asks for the password again
	// (prompt=login), though the browser may still be signed in to the portal. Signing in with FFPF ID removes it.
	reloginCookie = "typle-ffpf-relogin"
	// appReturn is where a login an app (the iPad, the Mac, the Android or the Windows app) starts ends: the iPad and
	// Mac apps' ASWebAuthenticationSession, the Android app's intent filter and the Windows app's protocol registration
	// wait for this scheme and give the URL to the app.
	appReturn = "typle-r://login"
	// maxTokenRequest is far more than a code and a verifier take.
	maxTokenRequest = 4096
)

// appClients are the signin's clients for a login an app starts. Every app logs in the same way.
var appClients = map[string]bool{"ipad": true, "macos": true, "android": true, "windows": true}

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

// toApp ends a login an app (iPad, Mac, Android or Windows) started, with the code or the error.
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

// redirectURI is where the provider sends the browser back to: the callback URL of the GitHub OAuth App, or the
// redirect URI registered for the FFPF ID client.
func (s *server) redirectURI(path string) string {
	base := s.config.BaseURL
	return (&url.URL{Scheme: base.Scheme, Host: base.Host, Path: strings.TrimSuffix(base.Path, "/") + path}).String()
}

func (s *server) secure() bool {
	return s.config.BaseURL != nil && s.config.BaseURL.Scheme == "https"
}

// ready reports whether the provider's login is configured.
func (s *server) ready(provider string) bool {
	if s.config.BaseURL == nil {
		return false
	}
	if provider == providerFFPF {
		return s.config.FFPF != nil
	}
	return s.config.OAuth != nil && s.config.GitHub != nil
}

// loginReady reports whether the provider's login can run, and otherwise answers 503 and logs why. It is only logged,
// not reported: a missing setting would otherwise send an error to the tracker with every request.
func (s *server) loginReady(w http.ResponseWriter, r *http.Request, provider string) bool {
	if !s.ready(provider) {
		log.Printf("%s %s: the %s login is not configured", r.Method, r.URL.Path, provider)
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

// relogin sets or, with maxAge -1, removes reloginCookie. It lasts as long as a session, as the portal's own does.
func (s *server) relogin(maxAge int) *http.Cookie {
	value := "1"
	if maxAge < 0 {
		value = ""
	}
	return &http.Cookie{
		Name: reloginCookie, Value: value, Path: authPath, MaxAge: maxAge,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure(),
	}
}

// signedOut tells whether the browser signed out since its last login with FFPF ID.
func signedOut(r *http.Request) bool {
	_, err := r.Cookie(reloginCookie)
	return err == nil
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

// signin sends the browser to GitHub, or with provider=ffpf to FFPF ID, with a state and a PKCE challenge (and for FFPF
// ID a nonce), and keeps them, the verifier and where to return to in the signed OAuth cookie. With client=ipad,
// client=macos, client=android or client=windows and the app's own S256 code_challenge, the login is that app's: it
// ends at appReturn with a code that only the holder of the challenge's verifier can trade for a token. With admin=1
// the login is to the administrator's dashboard: it always goes through FFPF ID, whatever provider says, and always
// returns to the dashboard.
func (s *server) signin(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet) {
		return
	}
	query := r.URL.Query()
	admin := query.Get("admin") == "1"
	provider := providerGitHub
	if admin || query.Get("provider") == providerFFPF {
		provider = providerFFPF
	}
	if !s.loginReady(w, r, provider) {
		return
	}
	returnTo := safeReturnTo(query.Get("returnTo"))
	if admin {
		returnTo = adminPage
	}
	var appChallenge string
	if !admin && appClients[query.Get("client")] {
		if appChallenge = query.Get("code_challenge"); !pkceChallenge.MatchString(appChallenge) {
			toApp(w, "error", "loginFailed")
			return
		}
	}
	state, err := random()
	var verifier, nonce string
	if err == nil {
		verifier, err = random()
	}
	if err == nil && provider == providerFFPF {
		nonce, err = random()
	}
	if err != nil {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		refuse(w, http.StatusServiceUnavailable, "authUnavailable")
		return
	}
	pending := session.OAuth{
		State: state, Verifier: verifier, ReturnTo: returnTo, Challenge: appChallenge, Admin: admin,
		Expires: s.now().Add(session.OAuthMaxAge),
	}
	location := ""
	if provider == providerFFPF {
		pending.Provider, pending.Nonce = providerFFPF, nonce
		location = s.config.FFPF.AuthorizeURL(state, challengeOf(verifier), nonce, s.redirectURI(ffpfCallback), signedOut(r))
	} else {
		location = s.config.OAuth.AuthorizeURL(state, challengeOf(verifier), s.redirectURI(githubCallback))
	}
	http.SetCookie(w, s.oauthCookie(s.config.Keys.SealOAuth(pending), int(session.OAuthMaxAge.Seconds())))
	goTo(w, location)
}

// signedInUser is who a provider says signed in, in the form the session holds.
type signedInUser struct{ sub, name, image string }

// callback is where the provider sends the browser back to. Whatever happens, the OAuth cookie is spent and the
// browser goes back to the page it left, signed in only if everything checked out: the cookie was started for this
// provider, its state matches, and the provider vouches for the account. Errors are not shown: the screen has no page
// for a failed login, and what the provider says is not for the reader. A login an app (iPad, Mac, Android or Windows)
// started goes back to the app instead, with a code for it to trade for a token, or loginFailed; no cookie is set. A
// login to the administrator's dashboard ends in finishAdmin; it can only be one through FFPF ID, and one that comes
// back to GitHub's callback goes back to the dashboard with adminRefused.
func (s *server) callback(provider string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !methods(w, r, http.MethodGet) || !s.loginReady(w, r, provider) {
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
		if opened && pending.Admin && provider != providerFFPF {
			goTo(w, adminRefused)
			return
		}
		app := opened && pending.Challenge != ""
		fail := func() {
			if app {
				toApp(w, "error", "loginFailed")
			} else {
				goTo(w, returnTo)
			}
		}
		// The cookie of a GitHub login has no Provider, and that of an FFPF ID login "ffpf".
		started := providerGitHub
		if pending.Provider != "" {
			started = pending.Provider
		}
		query := r.URL.Query()
		state, code := query.Get("state"), query.Get("code")
		if !opened || started != provider || query.Get("error") != "" || state == "" || code == "" ||
			subtle.ConstantTimeCompare([]byte(state), []byte(pending.State)) != 1 {
			fail()
			return
		}
		var user signedInUser
		if provider == providerFFPF {
			ffpfUser, ok := s.ffpfUser(r, code, pending)
			if !ok {
				fail()
				return
			}
			if pending.Admin {
				s.finishAdmin(w, r, ffpfUser)
				return
			}
			user = signedInUser{sub: ffpfUser.Account(), name: strings.TrimSpace(ffpfUser.Name)}
		} else {
			var ok bool
			if user, ok = s.githubUser(r, code, pending); !ok {
				fail()
				return
			}
		}
		if app {
			toApp(w, "code", s.config.Keys.SealCode(session.AppCode{
				Sub: user.sub, Name: user.name, Image: user.image, Challenge: pending.Challenge,
				Expires: s.now().Add(session.AppCodeMaxAge),
			}))
			return
		}
		if provider == providerFFPF {
			http.SetCookie(w, s.relogin(-1))
		}
		s.issue(w, user.sub, user.name, user.image)
		goTo(w, returnTo)
	}
}

// ffpfUser trades the code of an FFPF ID login for the account it signs in, and reports a failure that is not FFPF ID
// refusing the login.
func (s *server) ffpfUser(r *http.Request, code string, pending session.OAuth) (auth.FFPFUser, bool) {
	user, err := s.config.FFPF.Exchange(r.Context(), code, pending.Verifier, s.redirectURI(ffpfCallback), pending.Nonce)
	if err != nil {
		// A refusal comes of what the user did, such as a code used twice, and is not the app's failure.
		if !errors.Is(err, auth.ErrFFPFRejected) {
			s.report(r, err, "auth.callback")
		}
		return auth.FFPFUser{}, false
	}
	return user, true
}

// githubUser trades the code of a GitHub login for a token and asks GitHub whose it is, reporting any failure.
func (s *server) githubUser(r *http.Request, code string, pending session.OAuth) (signedInUser, bool) {
	token, err := s.config.OAuth.Exchange(r.Context(), code, pending.Verifier, s.redirectURI(githubCallback))
	if err != nil {
		s.report(r, err, "auth.callback")
		return signedInUser{}, false
	}
	user, err := s.config.GitHub.User(r.Context(), token)
	if err != nil {
		s.report(r, err, "auth.callback")
		return signedInUser{}, false
	}
	return signedInUser{sub: user.Account(), name: strings.TrimSpace(user.DisplayName()), image: user.AvatarURL}, true
}

// tokenAnswer is the app's token and who it signs in.
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

// token trades the code a login of an app (iPad, Mac, Android or Windows) ended with, and the verifier of its
// challenge, for the app's token. It takes no cookie and sets none, so it needs no Origin: only the app that started
// the login knows the verifier. Any mistake is loginFailed, and the app starts the login again.
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

// sessionAnswer is who is signed in, and the providers the screen may offer to sign in with (in the order the screen
// lists them).
type sessionAnswer struct {
	User      *sessionUser `json:"user"`
	Providers []string     `json:"providers"`
}

// providers are the logins that are configured, "github" before "ffpf". It is never nil, so the answer has a list.
func (s *server) providers() []string {
	list := []string{}
	for _, provider := range []string{providerGitHub, providerFFPF} {
		if s.ready(provider) {
			list = append(list, provider)
		}
	}
	return list
}

// ErrSessionsUnchecked is what a SessionSource answers when it cannot tell yet, without waiting, whether a session was
// revoked: the /api/auth part does not open the database for the session's answer (server/vercel).
var ErrSessionsUnchecked = errors.New("the revocations were not read")

// session says who is signed in. It is not sealed again however active the user is: a session ends MaxAge after its
// login. A revoked one (signed out of every device) is no one, and its cookie is removed, when the revocations can be
// read at once; otherwise the answer goes on without them, as the session never waits for the database, and the
// account's data, which is read with the revocations (signedIn), stays out of reach all the same.
func (s *server) session(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead) {
		return
	}
	answer := sessionAnswer{Providers: s.providers()}
	user, ok := s.owner(r)
	if !ok {
		reply(w, http.StatusOK, answer)
		return
	}
	revoked, err := s.revoked(r, user)
	if err != nil && !errors.Is(err, ErrSessionsUnchecked) && !errors.Is(err, errNoSessions) {
		logOnly(r, err, "session.check")
	}
	if revoked {
		if !fromApp(r) {
			http.SetCookie(w, s.sessionCookie("", -1))
		}
		reply(w, http.StatusOK, answer)
		return
	}
	answer.User = userOf(user)
	reply(w, http.StatusOK, answer)
}

// signout forgets the session in the browser. With ?everywhere=1 it also signs the account out of every device: every
// session cookie and app token of a login until now is revoked (Store.RevokeSessions), which is the one way to stop a
// stolen one before it expires. An app may ask for that too, with its token and without an Origin. Signing out
// everywhere needs a session that is itself not revoked, so a stolen cookie that was revoked cannot sign out the logins
// made since; it answers loginRequired, and databaseUnavailable when the revocations cannot be read or written, and
// then the cookie is kept so that the user can try again. A browser that signs out is also marked (reloginCookie), so
// that its next login with FFPF ID asks for the password instead of passing straight through the portal's session.
func (s *server) signout(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	everywhere := r.URL.Query().Get("everywhere") == "1"
	if !(s.sameOrigin(r) || everywhere && fromApp(r)) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	if everywhere {
		user, ok := s.owner(r)
		if !ok {
			refuse(w, http.StatusUnauthorized, "loginRequired")
			return
		}
		revoked, err := s.revoked(r, user)
		if err == nil && !revoked {
			err = s.sessions().RevokeSessions(r.Context(), user.Sub)
		}
		switch {
		case err != nil:
			s.report(r, err, "session.revoke")
			refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
			return
		case revoked:
			if !fromApp(r) {
				http.SetCookie(w, s.sessionCookie("", -1))
			}
			refuse(w, http.StatusUnauthorized, "loginRequired")
			return
		}
	}
	if !fromApp(r) {
		http.SetCookie(w, s.sessionCookie("", -1))
		http.SetCookie(w, s.relogin(int(session.MaxAge.Seconds())))
	}
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
