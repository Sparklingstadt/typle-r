package web

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/sparklingstadt/typle-r/server/internal/operation"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// recordAdded is the answer of POST /api/workspace/records: the workspace as saved, as GET answers it, with the record.
type recordAdded struct {
	saved
	Record workspace.Record `json:"record"`
}

// addRecord takes { accountId, listId, record } and adds the record (workspace.RecordInput, which must have its id) to
// the list with operation.AddRecord, as POST /api/v1/lists/{listId}/records does. It names no revision: a practice
// run is saved however the lists were changed meanwhile, and sending it again does not add it twice. It answers 201 for
// a new record and 200 when the list already had it, both with the workspace as now saved.
func (s *server) addRecord(w http.ResponseWriter, r *http.Request) {
	if !methods(w, r, http.MethodPost) {
		return
	}
	// As for PUT /api/workspace.
	if !(fromApp(r) || s.sameOrigin(r)) || !jsonContent(r) {
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
		s.report(r, err, "record.add")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return
	}
	fields, err := parseObject(body)
	if err != nil {
		refuse(w, http.StatusBadRequest, "invalidRecord")
		return
	}
	if id, ok := accountID(fields); !ok || id != user.Sub {
		refuse(w, http.StatusUnauthorized, "loginAccountChanged")
		return
	}
	var listID string
	input, err := decodeRecord(fields["record"])
	if err != nil || json.Unmarshal(fields["listId"], &listID) != nil || listID == "" || len(fields) != 3 {
		refuse(w, http.StatusBadRequest, "invalidRecord")
		return
	}
	record, added, err := operation.AddRecord(r.Context(), s.config.Store, user.Sub, listID, *input)
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
	// The workspace is read as stored, as GET answers it. A save made since is in it too, with its own revision.
	result, err := s.config.Store.ReadRevision(r.Context(), user.Sub)
	if err == nil && result == nil {
		err = errors.New("workspace missing after a record was added")
	}
	if err != nil {
		s.report(r, err, "record.add")
		refuse(w, http.StatusServiceUnavailable, "workspaceSaveFailed")
		return
	}
	status := http.StatusOK
	if added {
		status = http.StatusCreated
	}
	reply(w, status, recordAdded{answer(result, user.Sub), record})
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
