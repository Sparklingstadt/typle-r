// Command typle-web serves the app's Go backend (/api/health, /api/workspace and /api/auth/*) locally, with the same
// handler as the Vercel functions. It reads the environment only: npm run dev passes the values of .env.local and
// .env, this command does not load them. Local login (POST /api/auth/local) is available under the same conditions as
// the app's: see web.FromEnv.
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

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/web"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8081", "address to listen on")
	flag.Parse()

	config, err := web.FromEnv(os.Getenv, true)
	if err != nil {
		log.Fatal(err)
	}
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
	source, err := store.OpenApp(open, connection)
	cancel()
	if err != nil {
		log.Fatalf("connect to the database: %v", err)
	}
	defer source.Close()
	config.Store = source
	config.Report = web.NewReporter(os.Getenv)

	// The timeouts of typle-api: a client that sends or reads slowly, or keeps an idle connection open, does not hold it
	// for ever.
	server := &http.Server{Addr: *addr, Handler: web.New(config), ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout: 30 * time.Second, WriteTimeout: time.Minute, IdleTimeout: 2 * time.Minute}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	log.Printf("serving the app's backend on http://%s (local login %v)", *addr, config.LocalLogin)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
