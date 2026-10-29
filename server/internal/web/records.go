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

// recordRequest checks a request to records as PUT /api/workspace is checked, and reads its body as a JSON object; the
// object's account is checked by recordAdd and recordDelete. Otherwise it answers the request.
func (s *server) recordRequest(w http.ResponseWriter, r *http.Request, reported string) (session.Session, map[string]json.RawMessage, bool) {
	if !s.fromAppOrOrigin(r) || !jsonContent(r) {
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
	return user, fields, true
}

// sameAccount refuses the members of a record request that are not for owner.
func sameAccount(fields map[string]json.RawMessage, owner string) *failure {
	if id, ok := accountID(fields); !ok || id != owner {
		return refused(http.StatusUnauthorized, "loginAccountChanged")
	}
	return nil
}

// stringField reads a field that must be a string other than "".
func stringField(fields map[string]json.RawMessage, name string) (string, bool) {
	var value string
	return value, json.Unmarshal(fields[name], &value) == nil && value != ""
}

func (s *server) addRecord(w http.ResponseWriter, r *http.Request, owner string, fields map[string]json.RawMessage) {
	record, added, result, f := s.recordAdd(r, owner, fields)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	status := http.StatusOK
	if added {
		status = http.StatusCreated
	}
	reply(w, status, recordAdded{answer(result, owner), record})
}

// recordAdd adds the record of a POST body's members for owner: the record as saved, whether it is new, and the
// workspace as saved after it.
func (s *server) recordAdd(r *http.Request, owner string, fields map[string]json.RawMessage) (workspace.Record, bool, *store.Saved, *failure) {
	if f := sameAccount(fields, owner); f != nil {
		return workspace.Record{}, false, nil, f
	}
	listID, ok := stringField(fields, "listId")
	input, err := decodeRecord(fields["record"])
	if err != nil || !ok || len(fields) != 3 {
		return workspace.Record{}, false, nil, refused(http.StatusBadRequest, "invalidRecord")
	}
	record, added, err := operation.AddRecord(r.Context(), s.config.Store, owner, listID, *input)
	var refusal *workspace.Error
	switch {
	case errors.As(err, &refusal) && refusal.Key == "listNotFound":
		return workspace.Record{}, false, nil, refused(http.StatusNotFound, "recordListDeleted")
	case errors.As(err, &refusal) && refusal.Key == "workspaceTooLarge":
		return workspace.Record{}, false, nil, refused(http.StatusRequestEntityTooLarge, refusal.Key)
	case errors.As(err, &refusal):
		return workspace.Record{}, false, nil, refused(http.StatusBadRequest, refusal.Key)
	case err != nil:
		return workspace.Record{}, false, nil, broken(err, "record.add", "workspaceSaveFailed")
	}
	result, f := s.savedAfter(r, owner, "record.add")
	if f != nil {
		return workspace.Record{}, false, nil, f
	}
	return record, added, result, nil
}

func (s *server) deleteRecord(w http.ResponseWriter, r *http.Request, owner string, fields map[string]json.RawMessage) {
	result, f := s.recordDelete(r, owner, fields)
	if f != nil {
		s.fail(w, r, f)
		return
	}
	reply(w, http.StatusOK, answer(result, owner))
}

// recordDelete deletes the record of a DELETE body's members for owner, and reads back the workspace as saved after it.
func (s *server) recordDelete(r *http.Request, owner string, fields map[string]json.RawMessage) (*store.Saved, *failure) {
	if f := sameAccount(fields, owner); f != nil {
		return nil, f
	}
	listID, okList := stringField(fields, "listId")
	recordID, okRecord := stringField(fields, "recordId")
	if !okList || !okRecord || len(fields) != 3 {
		return nil, refused(http.StatusBadRequest, "invalidRecord")
	}
	err := operation.DeleteRecord(r.Context(), s.config.Store, owner, listID, recordID)
	var refusal *workspace.Error
	// Already gone is what was asked for: a request sent again after a lost answer is answered as the first.
	if errors.As(err, &refusal) && (refusal.Key == "recordNotFound" || refusal.Key == "listNotFound") {
		err = nil
	}
	switch {
	case errors.As(err, &refusal) && refusal.Key == "workspaceTooLarge":
		return nil, refused(http.StatusRequestEntityTooLarge, refusal.Key)
	case errors.As(err, &refusal):
		return nil, refused(http.StatusBadRequest, refusal.Key)
	case err != nil:
		return nil, broken(err, "record.delete", "workspaceSaveFailed")
	}
	return s.savedAfter(r, owner, "record.delete")
}

// savedAfter reads the workspace as stored after a change, as GET answers it; a save made since is in it too, with its
// own revision.
func (s *server) savedAfter(r *http.Request, owner, reported string) (*store.Saved, *failure) {
	result, err := s.config.Store.ReadRevision(r.Context(), owner)
	if err == nil && result == nil {
		err = errors.New("workspace missing after a record was changed")
	}
	if err != nil {
		return nil, broken(err, reported, "workspaceSaveFailed")
	}
	return result, nil
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
