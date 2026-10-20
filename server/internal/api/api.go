// Package api serves workspaces in the shapes of the removed /api/v1 (docs/api.md): read-only, or with lists, devices and
// records to create, change and delete when it is given a Writer. Each request names its GitHub account with a token
// and reads and writes only that account's workspace.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

const (
	defaultLimit = 100
	maxLimit     = 1000
)

type listSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	WordCount   int    `json:"wordCount"`
	RecordCount int    `json:"recordCount"`
	CreatedAt   string `json:"createdAt"`
}

type listDetail struct {
	listSummary
	Words []workspace.Word `json:"words"`
}

func summary(list *workspace.List) listSummary {
	return listSummary{ID: list.ID, Name: list.Name, WordCount: len(list.Words), RecordCount: len(list.Records), CreatedAt: list.CreatedAt}
}

// Source reads an account's current workspace. It is read again for every request, so changes saved in the app show
// at once.
type Source interface {
	Read(ctx context.Context, owner string) (*workspace.Workspace, error)
}

// Writer changes an account's workspace and saves it, as store.Store.Modify does. change reports whether it changed
// anything; its errors, and a *workspace.Error for a change too large to save, come back unchanged.
type Writer interface {
	Modify(ctx context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error)
}

// Verifier tells which account a token belongs to: auth.ErrInvalidToken when it belongs to none, auth.ErrUnavailable
// when that cannot be told now.
type Verifier interface {
	Owner(ctx context.Context, token string) (string, error)
}

type server struct {
	source   Source
	writer   Writer
	verifier Verifier
}

// New serves the API. With a nil writer it is read-only: only GET and HEAD are answered, as before.
func New(source Source, writer Writer, verifier Verifier) http.Handler {
	s := &server{source: source, writer: writer, verifier: verifier}
	mux := http.NewServeMux()
	mux.Handle("/api/v1/devices", s.route(devices, write{http.MethodPost, s.createDevice}))
	mux.Handle("/api/v1/devices/{deviceId}", s.route(device, write{http.MethodPatch, s.updateDevice}, write{http.MethodDelete, s.deleteDevice}))
	mux.Handle("/api/v1/lists", s.route(lists, write{http.MethodPost, s.createList}))
	mux.Handle("/api/v1/lists/import", s.route(nil, write{http.MethodPost, s.importList}))
	mux.Handle("/api/v1/lists/{listId}/copy", s.route(nil, write{http.MethodPost, s.copyList}))
	mux.Handle("/api/v1/lists/{listId}/words.csv", s.route(wordsCSV))
	mux.Handle("/api/v1/lists/{listId}", s.route(list, write{http.MethodPatch, s.updateList}, write{http.MethodDelete, s.deleteList}))
	mux.Handle("/api/v1/lists/{listId}/records", s.route(records, write{http.MethodPost, s.addRecord}))
	mux.Handle("/api/v1/lists/{listId}/records/{recordId}", s.route(record, write{http.MethodPatch, s.updateRecord}, write{http.MethodDelete, s.deleteRecord}))
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { failure(w, http.StatusNotFound, "notFound") })
	return mux
}

type handler func(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace)

// A write handles a method that changes the workspace of the account named by owner.
type write struct {
	method string
	handle func(w http.ResponseWriter, r *http.Request, owner string)
}

// RFC 6750 names the scheme a 401 expects.
func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", "Bearer")
	failure(w, http.StatusUnauthorized, "invalidToken")
}

// route answers GET and HEAD with the workspace of the account the request's token belongs to, and the writes'
// methods when the server is writable. Any other method is answered 405, before the token is checked. A path with no
// read (nil) answers only its writes.
func (s *server) route(read handler, writes ...write) http.Handler {
	allowed := []string{}
	if read != nil {
		allowed = append(allowed, http.MethodGet, http.MethodHead)
	}
	if s.writer == nil {
		writes = nil
	}
	for _, write := range writes {
		allowed = append(allowed, write.method)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !slices.Contains(allowed, r.Method) {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
			failure(w, http.StatusMethodNotAllowed, "methodNotAllowed")
			return
		}
		owner, ok := s.owner(w, r)
		if !ok {
			return
		}
		for _, write := range writes {
			if write.method == r.Method {
				write.handle(w, r, owner)
				return
			}
		}
		ws, err := s.source.Read(r.Context(), owner)
		if err != nil {
			// As before: a database failure, or saved data that no longer decodes, is the server's fault.
			log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
			failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
			return
		}
		read(w, r, ws)
	})
}

// owner returns the account the request's token belongs to, or answers the request when there is none.
func (s *server) owner(w http.ResponseWriter, r *http.Request) (string, bool) {
	token, ok := auth.BearerToken(r.Header.Get("Authorization"))
	if !ok {
		unauthorized(w)
		return "", false
	}
	owner, err := s.verifier.Owner(r.Context(), token)
	if errors.Is(err, auth.ErrInvalidToken) {
		unauthorized(w)
		return "", false
	}
	if err != nil {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		failure(w, http.StatusServiceUnavailable, "githubUnavailable")
		return "", false
	}
	return owner, true
}

// As before, nothing is cached and no CORS headers are sent.
func respond(w http.ResponseWriter, status int, value any) {
	header := w.Header()
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	header.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func failure(w http.ResponseWriter, status int, key string) {
	respond(w, status, map[string]string{"error": key})
}

// usedDevice is a registered device with how often it was practised on.
type usedDevice struct {
	device workspace.Device
	usage  workspace.Usage
}

// MarshalJSON writes the device's own fields, then the usage's.
func (d usedDevice) MarshalJSON() ([]byte, error) {
	device, err := json.Marshal(d.device)
	if err != nil {
		return nil, err
	}
	usage, err := json.Marshal(d.usage)
	if err != nil {
		return nil, err
	}
	return append(append(device[:len(device)-1], ','), usage[1:]...), nil
}

func devices(w http.ResponseWriter, _ *http.Request, ws *workspace.Workspace) {
	usage := workspace.DeviceUsage(ws.Lists)
	devices := make([]usedDevice, 0, len(ws.Devices))
	for _, device := range ws.Devices {
		devices = append(devices, usedDevice{device: device, usage: usage[device.ID]})
	}
	respond(w, http.StatusOK, map[string]any{"devices": devices, "default": usage[workspace.DefaultDeviceID]})
}

// wordsCSV answers a list's words as a CSV file, as the app's export does, named by the list.
func wordsCSV(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	filename := workspace.WordFilename(list.Name, "csv")
	header := w.Header()
	header.Set("Content-Type", "text/csv; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, asciiFilename(filename), encodeRFC5987(filename)))
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, workspace.EncodeWordCSV(list.Words))
}

// asciiFilename is the filename for clients that only read filename=: characters outside ASCII become _.
func asciiFilename(name string) string {
	return strings.Map(func(r rune) rune {
		if r > 0x7e {
			return '_'
		}
		return r
	}, name)
}

// encodeRFC5987 percent-encodes a UTF-8 filename for filename*= (RFC 8187), keeping only attr-char.
func encodeRFC5987(name string) string {
	var b strings.Builder
	for _, c := range []byte(name) {
		if 'A' <= c && c <= 'Z' || 'a' <= c && c <= 'z' || '0' <= c && c <= '9' || strings.IndexByte("!#$&+-.^_`|~", c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// wordsCSV answers a list's words as a CSV file, as the app's export does, named by the list.
func wordsCSV(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	filename := workspace.WordFilename(list.Name, "csv")
	header := w.Header()
	header.Set("Content-Type", "text/csv; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, asciiFilename(filename), encodeRFC5987(filename)))
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, workspace.EncodeWordCSV(list.Words))
}

// asciiFilename is the filename for clients that only read filename=: characters outside ASCII become _.
func asciiFilename(name string) string {
	return strings.Map(func(r rune) rune {
		if r > 0x7e {
			return '_'
		}
		return r
	}, name)
}

// encodeRFC5987 percent-encodes a UTF-8 filename for filename*= (RFC 8187), keeping only attr-char.
func encodeRFC5987(name string) string {
	var b strings.Builder
	for _, c := range []byte(name) {
		if 'A' <= c && c <= 'Z' || 'a' <= c && c <= 'z' || '0' <= c && c <= '9' || strings.IndexByte("!#$&+-.^_`|~", c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// device answers a registered device. The built-in one is not registered, as in the list of devices.
func device(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	for _, device := range ws.Devices {
		if device.ID == r.PathValue("deviceId") {
			respond(w, http.StatusOK, map[string]any{"device": usedDevice{device: device, usage: workspace.DeviceUsage(ws.Lists)[device.ID]}})
			return
		}
	}
	failure(w, http.StatusNotFound, "deviceNotFound")
}

func lists(w http.ResponseWriter, _ *http.Request, ws *workspace.Workspace) {
	lists := make([]listSummary, 0, len(ws.Lists))
	for i := range ws.Lists {
		lists = append(lists, summary(&ws.Lists[i]))
	}
	respond(w, http.StatusOK, map[string]any{"lists": lists})
}

func detail(list *workspace.List) listDetail {
	return listDetail{listSummary: summary(list), Words: list.Words}
}

func list(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	respond(w, http.StatusOK, map[string]any{"list": detail(list)})
}

// record answers a saved run by its id. Runs saved without an id cannot be named.
func record(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	record := list.FindRecord(r.PathValue("recordId"))
	if record == nil {
		failure(w, http.StatusNotFound, "recordNotFound")
		return
	}
	respond(w, http.StatusOK, map[string]any{"record": record})
}

var digits = regexp.MustCompile(`^\d+$`)

// records lists the newest first. `since` keeps the ones after that time; `limit` is 1 to 1000 (100 by default).
func records(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	query := r.URL.Query()
	limit := defaultLimit
	if query.Has("limit") {
		text := query.Get("limit")
		value, err := strconv.Atoi(text)
		if !digits.MatchString(text) || err != nil || value < 1 || value > maxLimit {
			failure(w, http.StatusBadRequest, "invalidQuery")
			return
		}
		limit = value
	}
	records := slices.Clone(list.Records)
	if query.Has("since") {
		since, ok := workspace.ParseTime(query.Get("since"))
		if !ok {
			failure(w, http.StatusBadRequest, "invalidQuery")
			return
		}
		records = slices.DeleteFunc(records, func(record workspace.Record) bool { return !record.At.After(since) })
	}
	slices.SortStableFunc(records, func(a, b workspace.Record) int { return b.At.Compare(a.At) })
	respond(w, http.StatusOK, map[string]any{"records": records[:min(limit, len(records))]})
}
