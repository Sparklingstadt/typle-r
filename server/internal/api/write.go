package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"reflect"
	"strings"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// The app's own saves are limited to the same size (MAX_WORKSPACE_BYTES).
const maxBody = 1 << 20

var errTrailing = errors.New("more than one JSON value")

// decode reads a JSON object of type T from the body, or answers the request: 415 for another content type, 413 for
// a body over 1 MiB, and 400 invalidJson for anything else that is not exactly one object of T's fields. Only the
// media type before ";" is looked at, as the app's own route does.
func decode[T any](w http.ResponseWriter, r *http.Request) (*T, bool) {
	mediaType, _, _ := strings.Cut(r.Header.Get("Content-Type"), ";")
	if !strings.EqualFold(strings.TrimSpace(mediaType), "application/json") {
		failure(w, http.StatusUnsupportedMediaType, "unsupportedContentType")
		return nil, false
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		failure(w, http.StatusRequestEntityTooLarge, "requestTooLarge")
		return nil, false
	}
	var value *T
	if err == nil {
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&value); err == nil {
			if extra := decoder.Decode(new(json.RawMessage)); extra != io.EOF {
				err = errTrailing
			}
		}
	}
	if err != nil || value == nil || !exactKeys(data, reflect.TypeFor[T]()) {
		failure(w, http.StatusBadRequest, "invalidJson")
		return nil, false
	}
	return value, true
}

// exactKeys tells whether every object in data names its fields exactly as t's JSON tags do. encoding/json also
// matches them in another case, such as NAME for name, which the API does not accept.
func exactKeys(data []byte, t reflect.Type) bool {
	var value any
	return json.Unmarshal(data, &value) == nil && keysMatch(value, t)
}

func keysMatch(value any, t reflect.Type) bool {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.Struct:
		object, _ := value.(map[string]any)
		for key, field := range object {
			typ, ok := fieldType(t, key)
			if !ok || !keysMatch(field, typ) {
				return false
			}
		}
	case reflect.Slice:
		items, _ := value.([]any)
		for _, item := range items {
			if !keysMatch(item, t.Elem()) {
				return false
			}
		}
	}
	return true
}

// fieldType returns the type of the field that the JSON key names exactly.
func fieldType(t reflect.Type, key string) (reflect.Type, bool) {
	for i := range t.NumField() {
		field := t.Field(i)
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" {
			name = field.Name
		}
		if field.IsExported() && name != "-" && name == key {
			return field.Type, true
		}
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
	switch {
	// A list or device named in the path is a resource that is not there; a deviceId given in a record's body is a
	// value of the request, and so a bad request.
	case refused.Key == "listNotFound", refused.Key == "recordNotFound",
		refused.Key == "deviceNotFound" && r.PathValue("deviceId") != "":
		failure(w, http.StatusNotFound, refused.Key)
	case refused.Key == "workspaceTooLarge":
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

func (s *server) createDevice(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.DeviceInput](w, r)
	if !ok {
		return
	}
	id := workspace.NewID()
	var created workspace.Device
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		device, err := workspace.CreateDevice(ws, *input, id)
		if err != nil {
			return false, err
		}
		created = *device
		return true, nil
	}) {
		return
	}
	respond(w, http.StatusCreated, map[string]any{"device": created})
}

func (s *server) updateDevice(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.DeviceInput](w, r)
	if !ok {
		return
	}
	if input.Name == nil && input.Layout == nil {
		failure(w, http.StatusBadRequest, "invalidJson")
		return
	}
	var updated workspace.Device
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		device, err := workspace.UpdateDevice(ws, r.PathValue("deviceId"), *input)
		if err != nil {
			return false, err
		}
		updated = *device
		return true, nil
	}) {
		return
	}
	respond(w, http.StatusOK, map[string]any{"device": updated})
}

func (s *server) deleteDevice(w http.ResponseWriter, r *http.Request, owner string) {
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		return true, workspace.DeleteDevice(ws, r.PathValue("deviceId"))
	}) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) updateRecord(w http.ResponseWriter, r *http.Request, owner string) {
	change, ok := decode[workspace.RecordChange](w, r)
	if !ok {
		return
	}
	if *change == (workspace.RecordChange{}) {
		failure(w, http.StatusBadRequest, "invalidJson")
		return
	}
	var updated workspace.Record
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		var err error
		updated, err = workspace.UpdateRecord(ws, r.PathValue("listId"), r.PathValue("recordId"), *change)
		return err == nil, err
	}) {
		return
	}
	respond(w, http.StatusOK, map[string]any{"record": updated})
}

func (s *server) deleteRecord(w http.ResponseWriter, r *http.Request, owner string) {
	if !s.modify(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		return true, workspace.DeleteRecord(ws, r.PathValue("listId"), r.PathValue("recordId"))
	}) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
