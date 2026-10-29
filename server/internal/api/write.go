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
	"unicode/utf8"

	"github.com/sparklingstadt/typle-r/server/internal/operation"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// The app's own saves are limited to the same size (MAX_WORKSPACE_BYTES).
const maxBody = 1 << 20

var errTrailing = errors.New("more than one JSON value")

// decode reads a JSON object of type T from the body, or answers the request: 415 for another content type, 413 for
// a body over 1 MiB, and 400 invalidJson for anything else that is not exactly one object of T's fields. Only the
// media type before ";" is looked at, as the /api/workspace handler does.
func decode[T any](w http.ResponseWriter, r *http.Request) (*T, bool) {
	if !jsonContent(r) {
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

// jsonContent tells whether the request's media type, before ";", is application/json.
func jsonContent(r *http.Request) bool {
	mediaType, _, _ := strings.Cut(r.Header.Get("Content-Type"), ";")
	return strings.EqualFold(strings.TrimSpace(mediaType), "application/json")
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
	return s.save(w, r, owner, change) != nil
}

// save is modify that returns the workspace as saved, or nil when the request was answered with why it could not be.
// The lists change edits are put in their packs after it (see store.Store.Modify), so a list to answer with is found in
// the workspace returned, not kept from change.
func (s *server) save(w http.ResponseWriter, r *http.Request, owner string, change func(*workspace.Workspace) (bool, error)) *workspace.Workspace {
	saved, err := s.writer.Modify(r.Context(), owner, change)
	if err != nil {
		fail(w, r, err)
		return nil
	}
	return saved
}

// fail answers a change that could not be saved: the key of a *workspace.Error, or 503 databaseUnavailable for anything
// else.
func fail(w http.ResponseWriter, r *http.Request, err error) {
	var refused *workspace.Error
	if !errors.As(err, &refused) {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return
	}
	refuse(w, r, refused)
}

// modifyList is modify for a change that makes or edits one list, which it answers with in its saved shape.
func (s *server) modifyList(w http.ResponseWriter, r *http.Request, owner string, status int,
	change func(*workspace.Workspace) (*workspace.List, error)) {
	var id string
	saved := s.save(w, r, owner, func(ws *workspace.Workspace) (bool, error) {
		list, err := change(ws)
		if err != nil {
			return false, err
		}
		id = list.ID
		return true, nil
	})
	if saved == nil {
		return
	}
	respond(w, status, map[string]any{"list": detail(saved.Find(id))})
}

// refuse answers a change that cannot be made with its key, and the line of a word file when there is one.
func refuse(w http.ResponseWriter, r *http.Request, refused *workspace.Error) {
	status := http.StatusBadRequest
	switch {
	// A list, pack, device or record named in the path is a resource that is not there; a deviceId given in a record's
	// body, or a packId given in a list's body or query, is a value of the request, and so a bad request.
	case refused.Key == "listNotFound", refused.Key == "recordNotFound",
		refused.Key == "deviceNotFound" && r.PathValue("deviceId") != "",
		refused.Key == "packNotFound" && r.PathValue("packId") != "":
		status = http.StatusNotFound
	case refused.Key == "workspaceTooLarge", refused.Key == "importTooLarge":
		status = http.StatusRequestEntityTooLarge
	// A followed official pack is in a state that does not take the change: the catalog keeps it.
	case refused.Key == "packFollowed":
		status = http.StatusConflict
	}
	body := map[string]any{"error": refused.Key}
	if refused.Line != 0 {
		body["line"] = refused.Line
	}
	respond(w, status, body)
}

func (s *server) createList(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.ListInput](w, r)
	if !ok {
		return
	}
	id, now := workspace.NewID(), time.Now()
	s.modifyList(w, r, owner, http.StatusCreated, func(ws *workspace.Workspace) (*workspace.List, error) {
		return workspace.CreateList(ws, *input, id, now)
	})
}

func (s *server) updateList(w http.ResponseWriter, r *http.Request, owner string) {
	input, ok := decode[workspace.ListInput](w, r)
	if !ok {
		return
	}
	if input.Name == nil && input.PackID == nil && input.Category == nil && input.Tags == nil && input.Levels == nil && input.Words == nil {
		failure(w, http.StatusBadRequest, "invalidJson")
		return
	}
	s.modifyList(w, r, owner, http.StatusOK, func(ws *workspace.Workspace) (*workspace.List, error) {
		return workspace.UpdateList(ws, r.PathValue("listId"), *input)
	})
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
	record, added, err := operation.AddRecord(r.Context(), s.writer, owner, r.PathValue("listId"), *input)
	if err != nil {
		fail(w, r, err)
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

// copyList takes an optional body: none copies with the generated name, { "name" } names the copy. The copy goes in
// its source's pack.
func (s *server) copyList(w http.ResponseWriter, r *http.Request, owner string) {
	var name *string
	if r.ContentLength != 0 {
		input, ok := decode[struct {
			Name *string `json:"name"`
		}](w, r)
		if !ok {
			return
		}
		name = input.Name
	}
	id, now := workspace.NewID(), time.Now()
	s.modifyList(w, r, owner, http.StatusCreated, func(ws *workspace.Workspace) (*workspace.List, error) {
		return workspace.CopyList(ws, r.PathValue("listId"), name, id, now)
	})
}

// importFormats are the word files a list is imported from, by the format query, as src/plugins/formats.
var importFormats = map[string]rune{"csv": ',', "tsv": '\t'}

// importList makes a list from a CSV or TSV file sent as the body, named by the name query, in the pack the packId
// query names or in a pack of its own.
func (s *server) importList(w http.ResponseWriter, r *http.Request, owner string) {
	mediaType, _, _ := strings.Cut(r.Header.Get("Content-Type"), ";")
	switch strings.ToLower(strings.TrimSpace(mediaType)) {
	case "text/csv", "text/tab-separated-values", "text/plain":
	default:
		failure(w, http.StatusUnsupportedMediaType, "unsupportedContentType")
		return
	}
	query := r.URL.Query()
	delimiter, ok := importFormats[query.Get("format")]
	if !ok {
		failure(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, workspace.MaxImportBytes))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		failure(w, http.StatusRequestEntityTooLarge, "importTooLarge")
		return
	}
	if err != nil {
		failure(w, http.StatusBadRequest, "invalidJson")
		return
	}
	// The app reads the file as UTF-8 and refuses any other encoding, such as the Shift_JIS Excel saves.
	if !utf8.Valid(data) {
		failure(w, http.StatusBadRequest, "importFileEncoding")
		return
	}
	words, err := workspace.ParseWordFile(string(data), delimiter)
	if err != nil {
		refuse(w, r, err.(*workspace.Error))
		return
	}
	var name *string
	if query.Has("name") {
		value := query.Get("name")
		name = &value
	}
	var packID *string
	if query.Has("packId") {
		value := query.Get("packId")
		packID = &value
	}
	id, now := workspace.NewID(), time.Now()
	s.modifyList(w, r, owner, http.StatusCreated, func(ws *workspace.Workspace) (*workspace.List, error) {
		return workspace.CreateList(ws, workspace.ListInput{Name: name, PackID: packID, Words: words}, id, now)
	})
}
