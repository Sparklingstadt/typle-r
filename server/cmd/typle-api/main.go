// Command typle-api serves Typle workspaces over HTTP, each to its own GitHub account: read-only, or with -writable
// also creating, changing and deleting lists and adding records. See api-docs/src/v1.
package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/api"
	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/serve"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on")
	writable := flag.Bool("writable", false, "accept writes: create, change and delete lists and add records")
	flag.Parse()

	// The same variables as typle-web and the Vercel functions.
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
	// A client that sends or reads slowly, or keeps an idle connection open, does not hold it for ever. A request takes
	// at most a GitHub check (10 seconds) and a few queries, with a body of at most 1 MiB.
	server := &http.Server{Handler: api.New(source, writer, auth.NewGitHub()), ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout: 30 * time.Second, WriteTimeout: time.Minute, IdleTimeout: 2 * time.Minute}

	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("serving workspaces %s to their GitHub accounts on http://%s", mode, *addr)
	// On SIGINT or SIGTERM, requests in flight get 5 seconds to finish before the deferred Close releases the database.
	if err := serve.Serve(ctx, server, listener, 5*time.Second); err != nil {
		log.Fatal(err)
	}
}
