// Command typle-api serves a Typle workspace read-only over HTTP. See docs/api.md.
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
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "address to listen on")
	data := flag.String("data", "", "workspace JSON copied from the browser (the initial lists when empty)")
	flag.Parse()

	var ws *workspace.Workspace
	var err error
	if *data == "" {
		ws, err = workspace.Initial()
	} else {
		ws, err = workspace.Load(*data)
	}
	if err != nil {
		log.Fatalf("read workspace: %v", err)
	}

	server := &http.Server{Addr: *addr, Handler: api.New(ws), ReadHeaderTimeout: 10 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	log.Printf("serving %d lists and %d devices on http://%s", len(ws.Lists), len(ws.Devices), *addr)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
