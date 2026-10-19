// Package api serves a workspace read-only, in the shapes of the removed /api/v1 (docs/api.md). There is no
// authentication yet: anyone who can reach the server can read the whole workspace.
package api

import (
	"encoding/json"
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

type server struct{ workspace *workspace.Workspace }

// New serves the workspace, which must not change while it is served.
func New(w *workspace.Workspace) http.Handler {
	s := &server{workspace: w}
	mux := http.NewServeMux()
	mux.Handle("/api/v1/devices", read(s.devices))
	mux.Handle("/api/v1/lists", read(s.lists))
	mux.Handle("/api/v1/lists/{listId}", read(s.list))
	mux.Handle("/api/v1/lists/{listId}/records", read(s.records))
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { failure(w, http.StatusNotFound, "notFound") })
	return mux
}

// read answers GET and HEAD only, with the JSON error the other routes use.
func read(handle http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			failure(w, http.StatusMethodNotAllowed, "methodNotAllowed")
			return
		}
		handle(w, r)
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

func (s *server) devices(w http.ResponseWriter, _ *http.Request) {
	respond(w, http.StatusOK, map[string]any{"devices": s.workspace.Devices})
}

func (s *server) lists(w http.ResponseWriter, _ *http.Request) {
	lists := make([]listSummary, 0, len(s.workspace.Lists))
	for i := range s.workspace.Lists {
		lists = append(lists, summary(&s.workspace.Lists[i]))
	}
	respond(w, http.StatusOK, map[string]any{"lists": lists})
}

func (s *server) list(w http.ResponseWriter, r *http.Request) {
	list := s.workspace.Find(r.PathValue("listId"))
	if list == nil {
		failure(w, http.StatusNotFound, "listNotFound")
		return
	}
	respond(w, http.StatusOK, map[string]any{"list": listDetail{listSummary: summary(list), Words: list.Words}})
}

var digits = regexp.MustCompile(`^\d+$`)

// records lists the newest first. `since` keeps the ones after that time; `limit` is 1 to 1000 (100 by default).
func (s *server) records(w http.ResponseWriter, r *http.Request) {
	list := s.workspace.Find(r.PathValue("listId"))
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
