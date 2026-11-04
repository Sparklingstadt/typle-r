package web

import (
	"errors"
	"net/http"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/session"
)

// fromApp reports whether the request is an app's (iPad, Mac, Android or Windows): it carries an Authorization header, which a
// browser does not send to this site on its own, and is then judged by that header alone.
func fromApp(r *http.Request) bool {
	return r.Header.Get("Authorization") != ""
}

// owner is the signed-in GitHub account: from an app's (iPad, Mac, Android or Windows) bearer token when the request has an
// Authorization header, and otherwise from the session cookie. A request with both is judged by the token, so a cookie
// never stands in for a token that is refused.
func (s *server) owner(r *http.Request) (session.Session, bool) {
	if fromApp(r) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" || strings.ContainsAny(token, " \t") {
			return session.Session{}, false
		}
		return s.config.Keys.OpenApp(token, s.now())
	}
	cookie, err := r.Cookie(session.CookieName(s.secure()))
	if err != nil {
		return session.Session{}, false
	}
	return s.config.Keys.Open(cookie.Value, s.now())
}

// errNoSessions is a server set up without a database to keep the revocations in.
var errNoSessions = errors.New("no database to check the session against")

// sessions is Config.Sessions, or else Config.Store, or nil.
func (s *server) sessions() SessionSource {
	if s.config.Sessions != nil {
		return s.config.Sessions
	}
	if s.config.Store != nil {
		return s.config.Store
	}
	return nil
}

// revoked reports whether the account signed out of every device after user's login.
func (s *server) revoked(r *http.Request, user session.Session) (bool, error) {
	sessions := s.sessions()
	if sessions == nil {
		return false, errNoSessions
	}
	revokedAt, err := sessions.SessionsRevokedAt(r.Context(), user.Sub)
	if err != nil {
		return false, err
	}
	return user.RevokedBy(revokedAt), nil
}

// signedIn is owner, for a request that reads or changes the account's data: the session must also not have been
// revoked. Otherwise it answers the request, and the caller answers only when it returns true: loginRequired without a
// session or with a revoked one, whose cookie is then removed, and databaseUnavailable when the revocations cannot be
// read, as the data cannot be either.
func (s *server) signedIn(w http.ResponseWriter, r *http.Request) (session.Session, bool) {
	user, f := s.account(w, r)
	if f != nil {
		s.fail(w, r, f)
		return session.Session{}, false
	}
	return user, true
}

// account is signedIn without the answer: it only removes the cookie of a revoked session, and returns the failure.
func (s *server) account(w http.ResponseWriter, r *http.Request) (session.Session, *failure) {
	user, ok := s.owner(r)
	if !ok {
		return session.Session{}, refused(http.StatusUnauthorized, "loginRequired")
	}
	revoked, err := s.revoked(r, user)
	if err != nil {
		return session.Session{}, broken(err, "session.check", "databaseUnavailable")
	}
	if revoked {
		if !fromApp(r) {
			http.SetCookie(w, s.sessionCookie("", -1))
		}
		return session.Session{}, refused(http.StatusUnauthorized, "loginRequired")
	}
	return user, nil
}
