// Command typle-api serves Typle workspaces over HTTP, each to its own GitHub account: read-only, or with -writable
// also creating, changing and deleting lists and adding records. See docs/api.md.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/api"
	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on")
	writable := flag.Bool("writable", false, "accept writes: create, change and delete lists and add records")
	flag.Parse()

	// The same variables as the app (src/plugins/storage/cloud/database.ts).
	connection := os.Getenv("DATABASE_URL")
	if connection == "" {
		connection = os.Getenv("POSTGRES_URL")
	}
	if connection == "" {
		log.Fatal("set DATABASE_URL (or POSTGRES_URL)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	open, cancel := context.WithTimeout(ctx, 15*time.Second)
	source, err := store.Open(open, connection, *writable)
	cancel()
	if err != nil {
		log.Fatalf("connect to the database: %v", err)
	}
	defer source.Close()

	// A nil Writer keeps the API read-only, and the read-only connection refuses writes as well.
	var writer api.Writer
	mode := "read-only"
	if *writable {
		writer, mode = source, "read-write"
	}
	server := &http.Server{Addr: *addr, Handler: api.New(source, writer, auth.NewGitHub()), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	log.Printf("serving workspaces %s to their GitHub accounts on http://%s", mode, *addr)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
