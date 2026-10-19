// Command typle-api serves one account's Typle workspace read-only over HTTP. See docs/api.md.
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
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on")
	owner := flag.String("owner", "", "account whose workspace is served, such as github:12345 (required)")
	flag.Parse()

	// The same variables as the app (src/plugins/storage/cloud/database.ts).
	connection := os.Getenv("DATABASE_URL")
	if connection == "" {
		connection = os.Getenv("POSTGRES_URL")
	}
	if connection == "" || *owner == "" {
		log.Fatal("set DATABASE_URL (or POSTGRES_URL) and -owner")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	open, cancel := context.WithTimeout(ctx, 15*time.Second)
	source, err := store.Open(open, connection, *owner)
	cancel()
	if err != nil {
		log.Fatalf("connect to the database: %v", err)
	}
	defer source.Close()

	server := &http.Server{Addr: *addr, Handler: api.New(source), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	log.Printf("serving the workspace of %s on http://%s", *owner, *addr)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
