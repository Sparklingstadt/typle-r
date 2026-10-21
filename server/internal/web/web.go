// Package web is the app's backend as one http.Handler, served by the Vercel Go function (server/vercel) beside the
// Next.js app.
package web

import (
	"context"
	"encoding/json"
	"net/http"
)

// Store is what the handlers need of the database.
type Store interface {
	Ping(ctx context.Context) error
}

// Config holds what the handlers depend on.
type Config struct {
	Store Store
}

type server struct{ config Config }

// New serves the app's /api paths; any other path is a 404.
func New(c Config) http.Handler {
	s := &server{config: c}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.health)
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
