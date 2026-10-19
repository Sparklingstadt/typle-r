// Package api serves a workspace read-only, in the shapes of the removed /api/v1 (docs/api.md). There is no
// authentication yet: anyone who can reach the server can read the whole workspace.
package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strconv"

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

// Source reads the current workspace. It is read again for every request, so changes saved in the app show at once.
type Source interface {
	Read(ctx context.Context) (*workspace.Workspace, error)
}

type server struct{ source Source }

func New(source Source) http.Handler {
	s := &server{source: source}
	mux := http.NewServeMux()
	mux.Handle("/api/v1/devices", s.read(devices))
	mux.Handle("/api/v1/lists", s.read(lists))
	mux.Handle("/api/v1/lists/{listId}", s.read(list))
	mux.Handle("/api/v1/lists/{listId}/records", s.read(records))
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { failure(w, http.StatusNotFound, "notFound") })
	return mux
}

type handler func(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace)

// read answers GET and HEAD only, with the JSON error the other routes use, and hands the handler the workspace.
func (s *server) read(handle handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			failure(w, http.StatusMethodNotAllowed, "methodNotAllowed")
			return
		}
		ws, err := s.source.Read(r.Context())
		if err != nil {
			// As before: a database failure, or saved data that no longer decodes, is the server's fault.
			log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
			failure(w, http.StatusServiceUnavailable, "databaseUnavailable")
			return
		}
		handle(w, r, ws)
	})
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

func devices(w http.ResponseWriter, _ *http.Request, ws *workspace.Workspace) {
	respond(w, http.StatusOK, map[string]any{"devices": ws.Devices})
}

func lists(w http.ResponseWriter, _ *http.Request, ws *workspace.Workspace) {
	lists := make([]listSummary, 0, len(ws.Lists))
	for i := range ws.Lists {
		lists = append(lists, summary(&ws.Lists[i]))
	}
	respond(w, http.StatusOK, map[string]any{"lists": lists})
}

func list(w http.ResponseWriter, r *http.Request, ws *workspace.Workspace) {
	list := ws.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	respond(w, http.StatusOK, map[string]any{"list": listDetail{listSummary: summary(list), Words: list.Words}})
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
