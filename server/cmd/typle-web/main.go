// Command typle-web serves the app's Go backend (/api/health, /api/workspace and /api/auth/*) locally, with the same
// handler as the Vercel functions (server/vercel). It reads the environment only: npm run dev passes the values of .env.local and
// .env, this command does not load them. Local login (POST /api/auth/local) is available under the same conditions as
// the app's: see web.FromEnv.
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

	"github.com/sparklingstadt/typle-r/server/internal/serve"
	"github.com/sparklingstadt/typle-r/server/vercel"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8081", "address to listen on")
	flag.Parse()

	// The same Backend as the Vercel functions, with the local login allowed. The login settings must be there to start;
	// the database need not: until it opens, /api/health and /api/workspace answer 503 databaseUnavailable and try again
	// on later requests, while /api/auth/* works, so the UI can be developed in guest mode without a database.
	backend := vercel.New(true)
	defer backend.Close()
	if err := backend.Check(); err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// The timeouts of typle-api: a client that sends or reads slowly, or keeps an idle connection open, does not hold it
	// for ever.
	server := &http.Server{Handler: backend, ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout: 30 * time.Second, WriteTimeout: time.Minute, IdleTimeout: 2 * time.Minute}
	// Open the database in the background, so that the server is up at once. The reason of a failure is logged by the
	// attempt itself.
	go func() {
		if !backend.Ready() {
			log.Print("WARNING: the database is not available (set DATABASE_URL or POSTGRES_URL to a running database): " +
				"/api/health and /api/workspace answer 503 until it opens, and are tried again on later requests; /api/auth/* works")
		}
	}()

	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("serving the app's backend on http://%s", *addr)
	// On SIGINT or SIGTERM, requests in flight get 5 seconds to finish before the deferred Close releases the database.
	if err := serve.Serve(ctx, server, listener, 5*time.Second); err != nil {
		log.Fatal(err)
	}
}
