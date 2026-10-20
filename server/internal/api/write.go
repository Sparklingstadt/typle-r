package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// The app's own saves are limited to the same size (MAX_WORKSPACE_BYTES).
const maxBody = 1 << 20

var errTrailing = errors.New("more than one JSON value")

// decode reads a JSON object of type T from the body, or answers the request: 415 for another content type, 413 for
// a body over 1 MiB, and 400 invalidJson for anything else that is not exactly one object of T's known fields.
func decode[T any](w http.ResponseWriter, r *http.Request) (*T, bool) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		failure(w, http.StatusUnsupportedMediaType, "unsupportedContentType")
		return nil, false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	decoder.DisallowUnknownFields()
	var value *T
	err = decoder.Decode(&value)
	if err == nil {
		if extra := decoder.Decode(new(json.RawMessage)); extra != io.EOF {
			err = errTrailing
			if extra != nil {
				err = extra
			}
		}
	}
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		failure(w, http.StatusRequestEntityTooLarge, "requestTooLarge")
	case err != nil || value == nil:
		failure(w, http.StatusBadRequest, "invalidJson")
	default:
		return value, true
	}
	return nil, false
}

// modify saves a change to the owner's workspace, or answers the request with why it could not: the key of a
// *workspace.Error, or 503 databaseUnavailable for anything else.
func (s *server) modify(w http.ResponseWriter, r *http.Request, owner string, change func(*workspace.Workspace) (bool, error)) bool {
	_, err := s.writer.Modify(r.Context(), owner, change)
	if err == nil {
		return true
	}
	var refused *workspace.Error
	if !errors.As(err, &refused) {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return false
	}
	switch refused.Key {
	case "listNotFound":
		failure(w, http.StatusNotFound, refused.Key)
	case "workspaceTooLarge":
		failure(w, http.StatusRequestEntityTooLarge, refused.Key)
	default:
		failure(w, http.StatusBadRequest, refused.Key)
	}
	return false
}

func (s *server) createList(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.ListInput](w, r)
	if !ok {
		return
	}
	id, now := workspace.NewID(), time.Now()
	var created listDetail
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		list, err := workspace.CreateList(ws, *input, id, now)
		if err != nil {
			return false, err
		}
		created = detail(list)
		return true, nil
	}) {
		return
	}
	respond(w, http.StatusCreated, map[string]any{"list": created})
}

func (s *server) updateList(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.ListInput](w, r)
	if !ok {
		return
	}
	if input.Name == nil && input.Words == nil {
		failure(w, http.StatusBadRequest, "invalidJson")
		return
	}
	var updated listDetail
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		list, err := workspace.UpdateList(ws, r.PathValue("listId"), *input)
		if err != nil {
			return false, err
		}
		updated = detail(list)
		return true, nil
	}) {
		return
	}
	respond(w, http.StatusOK, map[string]any{"list": updated})
}

func (s *server) deleteList(w http.ResponseWriter, r *http.Request, owner string) {
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		return true, workspace.DeleteList(ws, r.PathValue("listId"))
	}) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

// addRecord answers 201 for a new record, and 200 with the saved one when the list already has a record of that id.
func (s *server) addRecord(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.RecordInput](w, r)
	if !ok {
		return
	}
	id := workspace.NewID()
	var record workspace.Record
	var added bool
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		var err error
		record, added, err = workspace.AddRecord(ws, r.PathValue("listId"), *input, id)
		return added, err
	}) {
		return
	}
	status := http.StatusOK
	if added {
		status = http.StatusCreated
	}
	respond(w, status, map[string]any{"record": record})
}
