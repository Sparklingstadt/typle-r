// Package web is the app's backend as one http.Handler, served by the Vercel Go function (server/vercel) beside the
// Next.js app.
package web

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// Store is what the handlers need of the database.
type Store interface {
	Ping(ctx context.Context) error
	ReadRevision(ctx context.Context, owner string) (*store.Saved, error)
	WriteRevision(ctx context.Context, owner string, revision int, change store.Change) (*store.Saved, error)
}

// Config holds what the handlers depend on.
type Config struct {
	Store Store
	// Keys opens the session cookie. The zero Keys refuses every cookie, so nobody is signed in.
	Keys session.Keys
	// BaseURL is where the app is served (AUTH_URL): its scheme picks the cookie's name and its origin is the only one
	// a state-changing request may come from. Without it no request is from the app's own origin.
	BaseURL *url.URL
	// Now is the clock; time.Now when nil.
	Now func() time.Time
	// Report is told of a failure that is answered with a 503, with the operation that failed (such as
	// "workspace.read"), so that it can be sent to an error tracker. When nil the failure is only logged.
	Report func(r *http.Request, err error, operation string)
}

type server struct{ config Config }

// New serves the app's /api paths; any other path is a 404.
func New(c Config) http.Handler {
	s := &server{config: c}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.health)
	mux.HandleFunc("/api/workspace", s.workspace)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { failure(w, http.StatusNotFound, "notFound") })
	return mux
}

// Nothing is cached, as in the other API responses.
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
