package web

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// saved is the answer of GET and PUT. The lists, packs, devices and interests are the stored jsonb text, with the
// fields Typle does not know: Go decodes them only to check them (store.ReadRevision), so where Go and the app's
// decoders differ, the browser is the one to refuse the data (savedDataCorrupted). Packs are null for lists saved before
// packs existed, and for an account that has saved nothing. Interests are workspace.DefaultInterests (every option) when
// none have been saved, as the app reads them.
type saved struct {
	Lists     json.RawMessage `json:"lists"`
	Packs     json.RawMessage `json:"packs"`
	Devices   json.RawMessage `json:"devices"`
	Interests json.RawMessage `json:"interests"`
	Revision  int             `json:"revision"`
	AccountID string          `json:"accountId"`
}

// answer is the saved workspace as GET and PUT answer it.
func answer(result *store.Saved, account string) saved {
	interests := result.Interests
	if len(interests) == 0 {
		interests, _ = json.Marshal(workspace.DefaultInterests)
	}
	return saved{result.Lists, result.Packs, result.Devices, interests, result.Revision, account}
}

func (s *server) now() time.Time {
	if s.config.Now != nil {
		return s.config.Now()
	}
	return time.Now()
}

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

// fromAppOrOrigin reports whether a request may change the account's data: the Origin keeps other sites from changing it
// with the browser's cookie. An app's (iPad, Mac, Android or Windows) token is not sent by a browser on its own, so its
// requests, which have no Origin, need none.
func (s *server) fromAppOrOrigin(r *http.Request) bool {
	return fromApp(r) || s.sameOrigin(r)
}

// sameOrigin reports whether the request comes from the app's own pages: its Origin is that of BaseURL, written as a
// browser writes it (lower case, without the default port). State-changing requests must pass this.
func (s *server) sameOrigin(r *http.Request) bool {
	base := s.config.BaseURL
	if base == nil || base.Host == "" {
		return false
	}
	scheme, host := strings.ToLower(base.Scheme), strings.ToLower(base.Hostname())
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port := base.Port(); port != "" && !(scheme == "http" && port == "80") && !(scheme == "https" && port == "443") {
		host += ":" + port
	}
	origin := r.Header.Get("Origin")
	return origin != "" && origin == scheme+"://"+host
}

// jsonContent reports whether the request's body is declared as JSON. A form cannot send that type to another site
// without asking first (CORS), so with the Origin it keeps other sites' pages out.
func jsonContent(r *http.Request) bool {
	return strings.TrimSpace(strings.SplitN(r.Header.Get("Content-Type"), ";", 2)[0]) == "application/json"
}

// report tells Config.Report, or the log, of a failure that is answered with a 503.
func (s *server) report(r *http.Request, err error, operation string) {
	if s.config.Report != nil {
		s.config.Report(r, err, operation)
		return
	}
	logOnly(r, err, operation)
}

// HEAD is served as GET; net/http leaves the body out.
func (s *server) workspace(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodGet, http.MethodHead, http.MethodPut) {
		return
	}
	if r.Method == http.MethodPut {
		s.writeWorkspace(w, r)
		return
	}
	s.readWorkspace(w, r)
}

func (s *server) readWorkspace(w http.ResponseWriter, r *http.Request) {
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	result, f := s.loadWorkspace(r, user.Sub)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, answer(result, user.Sub))
}

// loadWorkspace reads the owner's workspace as GET answers it.
func (s *server) loadWorkspace(r *http.Request, owner string) (*store.Saved, *failure) {
	result, err := s.config.Store.ReadRevision(r.Context(), owner)
	if err != nil {
		return nil, broken(err, "workspace.read", "databaseUnavailable")
	}
	if result == nil {
		// An account that has saved nothing has no lists, not the first list that /api/v1 starts with.
		result = &store.Saved{Lists: json.RawMessage("[]"), Devices: json.RawMessage("[]")}
	}
	return result, nil
}

func (s *server) writeWorkspace(w http.ResponseWriter, r *http.Request) {
	if !s.fromAppOrOrigin(r) || !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return
	}
	if r.Body == nil || r.Body == http.NoBody {
		refuse(w, http.StatusBadRequest, "emptyRequest")
		return
	}
	body, err := readBody(r.Body)
	if errors.Is(err, errTooLarge) {
		refuse(w, http.StatusRequestEntityTooLarge, "workspaceTooLarge")
		return
	}
	if err != nil {
		s.report(r, err, "workspace.write")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return
	}
	fields, err := parseObject(body)
	if err != nil {
		refuse(w, http.StatusBadRequest, "invalidWorkspace")
		return
	}
	result, f := s.saveWorkspace(r, user.Sub, fields)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, answer(result, user.Sub))
}

// saveWorkspace saves the members of a PUT body for owner, and reads back the workspace as saved.
func (s *server) saveWorkspace(r *http.Request, owner string, fields map[string]json.RawMessage) (*store.Saved, *failure) {
	// The account is checked before the rest, so a screen that signed in as someone else is told so first.
	if id, ok := accountID(fields); !ok || id != owner {
		return nil, refused(http.StatusUnauthorized, "loginAccountChanged")
	}
	revision, change, err := decodeFields(fields)
	var refusal *workspace.Error
	// Lists sent with their packs whose levels overlap (workspace.CheckPacks) are told so; anything else is invalid.
	// Several levels of a list are not refused: the change stores the lists as Decode repairs them, joined into one.
	if errors.As(err, &refusal) && refusal.Key == "levelsConflict" {
		return nil, refused(http.StatusBadRequest, refusal.Key)
	}
	if err != nil {
		return nil, refused(http.StatusBadRequest, "invalidWorkspace")
	}
	result, err := s.config.Store.WriteRevision(r.Context(), owner, revision, change)
	switch {
	case errors.Is(err, store.ErrConflict):
		return nil, refused(http.StatusConflict, "conflict")
	case errors.As(err, &refusal) && (refusal.Key == "listLimit" || refusal.Key == "invalidWorkspace"):
		return nil, refused(http.StatusBadRequest, refusal.Key)
	case err != nil:
		return nil, broken(err, "workspace.write", "workspaceSaveFailed")
	}
	return result, nil
}
