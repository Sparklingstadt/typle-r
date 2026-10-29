package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/sparklingstadt/typle-r/server/internal/operation"
	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// recordAdded is the answer of POST /api/workspace/records: the workspace as saved, as GET answers it, with the record.
type recordAdded struct {
	saved
	Record workspace.Record `json:"record"`
}

// records changes one practice record of the account's workspace at a time, with the operations /api/v1 uses
// (server/internal/operation). Neither names a revision: a record is saved or deleted however the lists were changed
// meanwhile, and a request sent again does the same. Both answer with the workspace as now saved, as GET does.
//
//   - POST { accountId, listId, record } adds the record (workspace.RecordInput, which must have its id): 201 for a new
//     record and 200 when the list already had it, with the record.
//   - DELETE { accountId, listId, recordId } deletes the record: 200, also when it, or its list, is already gone.
func (s *server) records(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost, http.MethodDelete) {
		return
	}
	reported := "record.add"
	if r.Method == http.MethodDelete {
		reported = "record.delete"
	}
	user, fields, ok := s.recordRequest(w, r, reported)
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		s.deleteRecord(w, r, user.Sub, fields)
		return
	}
	s.addRecord(w, r, user.Sub, fields)
}

// recordRequest checks a request to records as PUT /api/workspace is checked, and reads its body as a JSON object of
// the signed-in account. Otherwise it answers the request.
func (s *server) recordRequest(w http.ResponseWriter, r *http.Request, reported string) (session.Session, map[string]json.RawMessage, bool) {
	if !(fromApp(r) || s.sameOrigin(r)) || !jsonContent(r) {
		refuse(w, http.StatusForbidden, "forbiddenRequest")
		return session.Session{}, nil, false
	}
	user, ok := s.signedIn(w, r)
	if !ok {
		return session.Session{}, nil, false
	}
	if r.Body == nil || r.Body == http.NoBody {
		refuse(w, http.StatusBadRequest, "emptyRequest")
		return session.Session{}, nil, false
	}
	body, err := readBody(r.Body)
	if errors.Is(err, errTooLarge) {
		refuse(w, http.StatusRequestEntityTooLarge, "workspaceTooLarge")
		return session.Session{}, nil, false
	}
	if err != nil {
		s.report(r, err, reported)
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return session.Session{}, nil, false
	}
	fields, err := parseObject(body)
	if err != nil {
		refuse(w, http.StatusBadRequest, "invalidRecord")
		return session.Session{}, nil, false
	}
	if id, ok := accountID(fields); !ok || id != user.Sub {
		refuse(w, http.StatusUnauthorized, "loginAccountChanged")
		return session.Session{}, nil, false
	}
	return user, fields, true
}

// stringField reads a field that must be a string other than "".
func stringField(fields map[string]json.RawMessage, name string) (string, bool) {
	var value string
	return value, json.Unmarshal(fields[name], &value) == nil && value != ""
}

func (s *server) addRecord(w http.ResponseWriter, r *http.Request, owner string, fields map[string]json.RawMessage) {
	listID, ok := stringField(fields, "listId")
	input, err := decodeRecord(fields["record"])
	if err != nil || !ok || len(fields) != 3 {
		refuse(w, http.StatusBadRequest, "invalidRecord")
		return
	}
	record, added, err := operation.AddRecord(r.Context(), s.config.Store, owner, listID, *input)
	var refused *workspace.Error
	switch {
	case errors.As(err, &refused) && refused.Key == "listNotFound":
		refuse(w, http.StatusNotFound, "recordListDeleted")
		return
	case errors.As(err, &refused) && refused.Key == "workspaceTooLarge":
		refuse(w, http.StatusRequestEntityTooLarge, refused.Key)
		return
	case errors.As(err, &refused):
		refuse(w, http.StatusBadRequest, refused.Key)
		return
	case err != nil:
		s.report(r, err, "record.add")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return
	}
	result, ok := s.savedAfter(w, r, owner, "record.add")
	if !ok {
		return
	}
	status := http.StatusOK
	if added {
		status = http.StatusCreated
	}
	reply(w, status, recordAdded{answer(result, owner), record})
}

func (s *server) deleteRecord(w http.ResponseWriter, r *http.Request, owner string, fields map[string]json.RawMessage) {
	listID, okList := stringField(fields, "listId")
	recordID, okRecord := stringField(fields, "recordId")
	if !okList || !okRecord || len(fields) != 3 {
		refuse(w, http.StatusBadRequest, "invalidRecord")
		return
	}
	err := operation.DeleteRecord(r.Context(), s.config.Store, owner, listID, recordID)
	var refused *workspace.Error
	// Already gone is what was asked for: a request sent again after a lost answer is answered as the first.
	if errors.As(err, &refused) && (refused.Key == "recordNotFound" || refused.Key == "listNotFound") {
		err = nil
	}
	switch {
	case errors.As(err, &refused) && refused.Key == "workspaceTooLarge":
		refuse(w, http.StatusRequestEntityTooLarge, refused.Key)
		return
	case errors.As(err, &refused):
		refuse(w, http.StatusBadRequest, refused.Key)
		return
	case err != nil:
		s.report(r, err, "record.delete")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return
	}
	if result, ok := s.savedAfter(w, r, owner, "record.delete"); ok {
		reply(w, http.StatusOK, answer(result, owner))
	}
}

// savedAfter reads the workspace as stored after a change, as GET answers it; a save made since is in it too, with its
// own revision. Otherwise it answers the request.
func (s *server) savedAfter(w http.ResponseWriter, r *http.Request, owner, reported string) (*store.Saved, bool) {
	result, err := s.config.Store.ReadRevision(r.Context(), owner)
	if err == nil && result == nil {
		err = errors.New("workspace missing after a record was changed")
	}
	if err != nil {
		s.report(r, err, reported)
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return nil, false
	}
	return result, true
}

// decodeRecord reads the record of an addRecord request: one object of workspace.RecordInput's fields, with its id.
func decodeRecord(raw json.RawMessage) (*workspace.RecordInput, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var input *workspace.RecordInput
	if err := decoder.Decode(&input); err != nil {
		return nil, err
	}
	if decoder.Decode(new(json.RawMessage)) != io.EOF || input == nil || input.ID == nil {
		return nil, errors.New("invalid record")
	}
	return input, nil
}
