package web

import (
	"encoding/json"
	"errors"
	"net/http"

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
		// An account that has saved nothing has no lists, not the initial lists.
		result = &store.Saved{Lists: json.RawMessage("[]"), Devices: json.RawMessage("[]")}
	}
	return result, nil
}

func (s *server) writeWorkspace(w http.ResponseWriter, r *http.Request) {
	user, fields, ok := s.saveRequest(w, r, "workspace.write", "invalidWorkspace")
	if !ok {
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
	case errors.As(err, &refusal) && (refusal.Key == "listLimit" || refusal.Key == "followLimit" || refusal.Key == "invalidWorkspace"):
		return nil, refused(http.StatusBadRequest, refusal.Key)
	case err != nil:
		return nil, broken(err, "workspace.write", "workspaceSaveFailed")
	}
	return result, nil
}
