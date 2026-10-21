// Package vercel builds the handler that the Vercel Go functions under api/ serve. It is outside server/internal
// because api/ at the repository root may not import internal packages.
package vercel

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/web"
)

var (
	mu      sync.Mutex
	handler http.Handler
)

// Handler returns the app's handler, built from the environment on first use and kept for the instance's later
// requests. When it cannot be built (no database URL, or the database does not answer) the request gets a 503 and the
// reason is logged; the failure is not kept, so the next request tries again.
func Handler() http.Handler {
	mu.Lock()
	defer mu.Unlock()
	if handler != nil {
		return handler
	}
	built, err := build()
	if err != nil {
		log.Printf("start the backend: %v", err)
		return unavailable
	}
	handler = built
	return handler
}

var unavailable = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`{"error":"databaseUnavailable"}` + "\n"))
})

func build() (http.Handler, error) {
	// The same variables as the app (src/plugins/storage/cloud/database.ts).
	connection := os.Getenv("DATABASE_URL")
	if connection == "" {
		connection = os.Getenv("POSTGRES_URL")
	}
	if connection == "" {
		return nil, errors.New("set DATABASE_URL (or POSTGRES_URL)")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	source, err := store.OpenApp(ctx, connection)
	if err != nil {
		return nil, err
	}
	return web.New(web.Config{Store: source}), nil
}
