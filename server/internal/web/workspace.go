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

// saved is the answer of GET and PUT. The lists and devices are the stored jsonb text, with the fields Typle does not
// know: Go decodes them only to check them (store.ReadRevision), so where Go and the app's decoders differ, the browser
// is the one to refuse the data (savedDataCorrupted).
type saved struct {
	Lists     json.RawMessage `json:"lists"`
	Devices   json.RawMessage `json:"devices"`
	Revision  int             `json:"revision"`
	AccountID string          `json:"accountId"`
}

func (s *server) now() time.Time {
	if s.config.Now != nil {
		return s.config.Now()
	}
	return time.Now()
}

// fromApp reports whether the request is an app's (iPad, Android or Windows): it carries an Authorization header, which a
// browser does not send to this site on its own, and is then judged by that header alone.
func fromApp(r *http.Request) bool {
	return r.Header.Get("Authorization") != ""
}

// owner is the signed-in GitHub account: from an app's (iPad, Android or Windows) bearer token when the request has an
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
	user, ok := s.owner(r)
	if !ok {
		refuse(w, http.StatusUnauthorized, "loginRequired")
		return
	}
	result, err := s.config.Store.ReadRevision(r.Context(), user.Sub)
	if err != nil {
		s.report(r, err, "workspace.read")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	if result == nil {
		// An account that has saved nothing has no lists, not the first list that /api/v1 starts with.
		result = &store.Saved{Lists: json.RawMessage("[]"), Devices: json.RawMessage("[]")}
	}
	reply(w, http.StatusOK, saved{result.Lists, result.Devices, result.Revision, user.Sub})
}

func (s *server) writeWorkspace(w http.ResponseWriter, r *http.Request) {
	// The Origin keeps other sites from saving with the browser's cookie. An app's (iPad, Android or Windows) token is not sent by
	// a browser on its own, so its requests, which have no Origin, need none.
	if !(fromApp(r) || s.sameOrigin(r)) || strings.TrimSpace(strings.SplitN(r.Header.Get("Content-Type"), ";", 2)[0]) != "application/json" {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return
	}
	user, ok := s.owner(r)
	if !ok {
		refuse(w, http.StatusUnauthorized, "loginRequired")
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
	// The account is checked before the rest, so a screen that signed in as someone else is told so first.
	if id, ok := accountID(fields); !ok || id != user.Sub {
		refuse(w, http.StatusUnauthorized, "loginAccountChanged")
		return
	}
	revision, change, err := decodeFields(fields)
	if errors.Is(err, errLegacy) {
		refuse(w, http.StatusConflict, "conflict")
		return
	}
	if err != nil {
		refuse(w, http.StatusBadRequest, "invalidWorkspace")
		return
	}
	result, err := s.config.Store.WriteRevision(r.Context(), user.Sub, revision, change)
	var refused *workspace.Error
	switch {
	case errors.Is(err, store.ErrConflict):
		refuse(w, http.StatusConflict, "conflict")
	case errors.As(err, &refused) && (refused.Key == "listLimit" || refused.Key == "invalidWorkspace"):
		refuse(w, http.StatusBadRequest, refused.Key)
	case err != nil:
		s.report(r, err, "workspace.write")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
	default:
		reply(w, http.StatusOK, saved{result.Lists, result.Devices, result.Revision, user.Sub})
	}
}
