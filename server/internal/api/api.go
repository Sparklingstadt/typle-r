// Package api serves workspaces in the shapes of the removed /api/v1 (api-docs/src/v1): read-only, or with packs, lists,
// devices and records to create, change and delete when it is given a Writer. Each request names its GitHub account
// with a token and reads and writes only that account's workspace.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/operation"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

type listSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// PackID is the word pack the list belongs to; its category and tags are the pack's.
	PackID string `json:"packId"`
	// Category is null and Tags empty when the list has none.
	Category *string  `json:"category"`
	Tags     []string `json:"tags"`
	// Levels are what the practice screen picks the list of its pack by; empty when it has none.
	Levels []string `json:"levels"`
	// Writing is the mark of a list that can be practised by handwriting; other lists leave it out, so what the API answers
	// for them does not change.
	Writing     *workspace.Writing `json:"writing,omitempty"`
	WordCount   int                `json:"wordCount"`
	RecordCount int                `json:"recordCount"`
	CreatedAt   string             `json:"createdAt"`
	// What the app's list of word lists shows: practiceCount is recordCount by the app's name for it.
	PracticeCount      int     `json:"practiceCount"`
	LastPracticed      *string `json:"lastPracticed"`
	CurrentRecordCount int     `json:"currentRecordCount"`
	// Origin is the official list a list of a followed pack is kept equal to, and null for other lists.
	Origin *workspace.ListOrigin `json:"origin"`
}

type listDetail struct {
	listSummary
	Words []workspace.Word `json:"words"`
}

func summary(list *workspace.List) listSummary {
	overview := workspace.Overviews([]workspace.List{*list})[0]
	var last *string
	if overview.LastPracticed != nil {
		formatted := workspace.FormatTime(*overview.LastPracticed)
		last = &formatted
	}
	var category *string
	if list.Category != "" {
		category = &list.Category
	}
	tags := list.Tags
	if tags == nil {
		tags = []string{}
	}
	levels := list.Levels
	if levels == nil {
		levels = []string{}
	}
	return listSummary{ID: list.ID, Name: list.Name, PackID: list.PackID, Category: category, Tags: tags, Levels: levels, Writing: list.Writing, WordCount: len(list.Words),
		RecordCount: len(list.Records), CreatedAt: list.CreatedAt, PracticeCount: overview.PracticeCount, LastPracticed: last,
		CurrentRecordCount: workspace.CurrentRecordCount(list), Origin: list.Origin}
}

// Source reads an account's current workspace. It is read again for every request, so changes saved in the app show
// at once.
type Source interface {
	Read(ctx context.Context, owner string) (*workspace.Workspace, error)
}

// RecordSource is a Source that can read a page of one list's records without the rest of the workspace, as
// store.Store.Records does: ok is false when it cannot, and the whole workspace is read instead.
type RecordSource interface {
	Records(ctx context.Context, owner, listID string, since *time.Time, limit int) (records []workspace.Record, ok bool, err error)
}

// Writer changes an account's workspace and saves it, as store.Store.Modify does. change reports whether it changed
// anything; its errors, and a *workspace.Error for a change too large to save, come back unchanged.
type Writer = operation.Writer

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
	mux.Handle("/api/v1/dashboard", s.route(dashboard))
	mux.Handle("/api/v1/records", s.route(feed))
	mux.Handle("/api/v1/rankings", s.route(rankings))
	mux.Handle("/api/v1/rankings/{listId}", s.route(ranking))
	mux.Handle("/api/v1/devices", s.route(devices, write{http.MethodPost, s.createDevice}))
	mux.Handle("/api/v1/devices/{deviceId}", s.route(device, write{http.MethodPatch, s.updateDevice}, write{http.MethodDelete, s.deleteDevice}))
	mux.Handle("/api/v1/packs", s.route(packs, write{http.MethodPost, s.createPack}))
	mux.Handle("/api/v1/packs/import", s.route(nil, write{http.MethodPost, s.importPack}))
	mux.Handle("/api/v1/packs/{packId}", s.route(pack, write{http.MethodPatch, s.updatePack}, write{http.MethodDelete, s.deletePack}))
	mux.Handle("/api/v1/packs/{packId}/copy", s.route(nil, write{http.MethodPost, s.copyPack}))
	mux.Handle("/api/v1/packs/{packId}/export", s.route(exportPack))
	mux.Handle("/api/v1/lists", s.route(lists, write{http.MethodPost, s.createList}))
	mux.Handle("/api/v1/lists/import", s.route(nil, write{http.MethodPost, s.importList}))
	mux.Handle("/api/v1/lists/{listId}/copy", s.route(nil, write{http.MethodPost, s.copyList}))
	mux.Handle("/api/v1/lists/{listId}/words.csv", s.route(wordsCSV))
	mux.Handle("/api/v1/lists/{listId}", s.route(list, write{http.MethodPatch, s.updateList}, write{http.MethodDelete, s.deleteList}))
	mux.Handle("/api/v1/lists/{listId}/records", s.routeFirst(s.recordPage, records, write{http.MethodPost, s.addRecord}))
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
	return s.routeFirst(nil, read, writes...)
}

// routeFirst is route where a GET or HEAD is first given to first, when it is not nil, to answer without reading the
// whole workspace: read answers it only when first returns false.
func (s *server) routeFirst(first func(w http.ResponseWriter, r *http.Request, owner string) bool, read handler, writes ...write) http.Handler {
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
		if first != nil && first(w, r, owner) {
			return
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
	setHeaders(w.Header(), "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// noContent answers 204 for a change done, kept by no cache as every answer is.
func noContent(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

// setHeaders sets the headers of every answer: its type, kept by no cache, and not to be sniffed.
func setHeaders(header http.Header, contentType string) {
	header.Set("Content-Type", contentType)
	header.Set("Cache-Control", "no-store")
	header.Set("X-Content-Type-Options", "nosniff")
}

// download answers body as a file to save, named filename (see asciiFilename and encodeRFC5987).
func download(w http.ResponseWriter, contentType, filename string, body []byte) {
	header := w.Header()
	setHeaders(header, contentType)
	header.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, asciiFilename(filename), encodeRFC5987(filename)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
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
	download(w, "text/csv; charset=utf-8", workspace.WordFilename(list.Name, "csv"), []byte(workspace.EncodeWordCSV(list.Words)))
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

// lists answers the lists in their saved order, or ordered by the sort query as the app's list of word lists does,
// keeping those that match the q query, the category query (empty for the lists without one) and every tag query.
func lists(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	query := r.URL.Query()
	items := workspace.Overviews(ws.Lists)
	if query.Has("sort") {
		sorted, ok := workspace.SortOverviews(items, query.Get("sort"))
		if !ok {
			failure(w, http.StatusBadRequest, "invalidQuery")
			return
		}
		items = sorted
	}
	var category *string
	if query.Has("category") {
		value := query.Get("category")
		category = &value
	}
	lists := make([]listSummary, 0, len(items))
	for _, item := range items {
		if workspace.MatchesQuery(item.List, query.Get("q")) && workspace.MatchesFilter(item.List, category, query["tag"]) {
			lists = append(lists, summary(item.List))
		}
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

// recordPage answers records from the list's records alone when the source can read them so (RecordSource). A query
// that records would refuse is left to it.
func (s *server) recordPage(w http.ResponseWriter, r *http.Request, owner string) bool {
	source, ok := s.source.(RecordSource)
	if !ok {
		return false
	}
	query := r.URL.Query()
	limit, okLimit := readLimit(query)
	since, okSince := readSince(query)
	if !okLimit || !okSince {
		return false
	}
	page, ok, err := source.Records(r.Context(), owner, r.PathValue("listId"), since, limit)
	if err != nil {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return true
	}
	if ok {
		respond(w, http.StatusOK, map[string]any{"records": page})
	}
	return ok
}

// records lists the newest first. `since` keeps the ones after that time; `limit` is 1 to 1000 (100 by default).
func records(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	query := r.URL.Query()
	limit, okLimit := readLimit(query)
	since, okSince := readSince(query)
	if !okLimit || !okSince {
		failure(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	records := slices.Clone(list.Records)
	if since != nil {
		records = slices.DeleteFunc(records, func(record workspace.Record) bool { return !record.At.After(*since) })
	}
	slices.SortStableFunc(records, func(a, b workspace.Record) int { return b.At.Compare(a.At) })
	respond(w, http.StatusOK, map[string]any{"records": records[:min(limit, len(records))]})
}

// feed lists every list's records newest first, as the app's 練習記録 does, each with its list, whether it is the
// list's best and its day in tz. list, device (or none), since and limit narrow it.
func feed(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	query := r.URL.Query()
	limit, okLimit := readLimit(query)
	since, okSince := readSince(query)
	loc, okLocation := location(query)
	if !okLimit || !okSince || !okLocation {
		failure(w, http.StatusBadRequest, "invalidQuery")
		return
	}
	records := []json.RawMessage{}
	for _, row := range workspace.Feed(ws.Lists, query.Get("list"), query.Get("device")) {
		if len(records) == limit {
			break
		}
		if since != nil && !row.Record.At.After(*since) {
			continue
		}
		record, err := withFields(row.Record, map[string]any{"listId": row.List.ID, "listName": row.List.Name, "best": row.Best,
			"day": row.Record.At.In(loc).Format(time.DateOnly)})
		if err != nil {
			log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
			failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
			return
		}
		records = append(records, record)
	}
	respond(w, http.StatusOK, map[string]any{"records": records})
}
