package web

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// saved is the answer of GET and PUT. The lists and devices are written as stored, with the fields Typle does not know.
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

// fromApp reports whether the request is the iPad app's: it carries an Authorization header, which a browser does not
// send to this site on its own, and is then judged by that header alone.
func fromApp(r *http.Request) bool {
	return r.Header.Get("Authorization") != ""
}

// owner is the signed-in GitHub account: from the iPad app's bearer token when the request has an Authorization header,
// and otherwise from the session cookie. A request with both is judged by the token, so a cookie never stands in for
// a token that is refused.
func (s *server) owner(r *http.Request) (session.Session, bool) {
	if fromApp(r) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" || strings.ContainsAny(token, " \t") {
			return session.Session{}, false
		}
		return s.config.Keys.OpenApp(token, s.now())
	}
	cookie, err := r.Cookie(session.CookieName(s.config.BaseURL != nil && s.config.BaseURL.Scheme == "https"))
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
	log.Printf("%s %s: %s: %v", r.Method, r.URL.Path, operation, err)
}

// The answers are the account's own, so a shared cache must not keep them.
func reply(w http.ResponseWriter, status int, value any) {
	header := w.Header()
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "private, no-store")
	header.Set("Vary", "Cookie")
	header.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// Errors are keys of the app's `errors` messages; the screen shows them in the reader's language.
func refuse(w http.ResponseWriter, status int, key string) {
	reply(w, status, map[string]string{"error": key})
}

// encode writes a workspace as it is stored, which also makes sure that empty lists and devices are [] and not null.
func encode(owner string, result *store.Saved) (saved, error) {
	lists, err := workspace.Encode(result.Workspace.Lists)
	if err != nil {
		return saved{}, err
	}
	devices, err := workspace.EncodeDevices(result.Workspace.Devices)
	if err != nil {
		return saved{}, err
	}
	return saved{lists, devices, result.Revision, owner}, nil
}

func (s *server) workspace(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.readWorkspace(w, r)
	case http.MethodPut:
		s.writeWorkspace(w, r)
	default:
		w.Header().Set("Allow", "GET, PUT")
		failure(w, http.StatusMethodNotAllowed, "methodNotAllowed")
	}
}

func (s *server) readWorkspace(w http.ResponseWriter, r *http.Request) {
	user, ok := s.owner(r)
	if !ok {
		refuse(w, http.StatusUnauthorized, "loginRequired")
		return
	}
	result, err := s.config.Store.ReadRevision(r.Context(), user.Sub)
	var body saved
	if err == nil {
		if result == nil {
			// An account that has saved nothing has no lists, not the first list that /api/v1 starts with.
			result = &store.Saved{Workspace: &workspace.Workspace{}}
		}
		body, err = encode(user.Sub, result)
	}
	if err != nil {
		s.report(r, err, "workspace.read")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	reply(w, http.StatusOK, body)
}

func (s *server) writeWorkspace(w http.ResponseWriter, r *http.Request) {
	// The Origin keeps other sites from saving with the browser's cookie. The iPad app's token is not sent by a browser
	// on its own, so its requests, which have no Origin, need none.
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
		body, err := encode(user.Sub, result)
		if err != nil {
			s.report(r, err, "workspace.write")
			refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
			return
		}
		reply(w, http.StatusOK, body)
	}
}
