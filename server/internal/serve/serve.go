// Package serve runs the HTTP server of a command (typle-web) until it is told to stop.
package serve

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"time"
)

// Serve serves on listener until ctx is done, then shuts the server down: requests in flight get up to grace to finish.
// Shutdown makes server.Serve return at once, so Serve waits for the shutdown itself before it returns; the command
// then closes what the requests use (the database) only once they are done. Requests cut at the end of the grace are
// logged; the error is only that of serving.
func Serve(ctx context.Context, server *http.Server, listener net.Listener, grace time.Duration) error {
	done := make(chan struct{})
	go func() {
		defer close(done)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), grace)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Printf("shut down: %v", err)
		}
	}()
	if err := server.Serve(listener); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	<-done
	return nil
}
