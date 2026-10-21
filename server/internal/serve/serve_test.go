package serve

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"
)

// A request in flight when the server is told to stop is answered before Serve returns, so that the command does not
// close the database under it.
func TestServeWaitsForRequestsInFlight(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	started, release := make(chan struct{}), make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		w.WriteHeader(http.StatusNoContent)
	})}
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	served := make(chan error, 1)
	go func() { served <- Serve(ctx, server, listener, 5*time.Second) }()
	answered := make(chan int, 1)
	go func() {
		response, err := http.Get("http://" + listener.Addr().String())
		if err != nil {
			answered <- 0
			return
		}
		response.Body.Close()
		answered <- response.StatusCode
	}()
	<-started
	stop()
	select {
	case err := <-served:
		t.Fatalf("Serve returned (%v) while a request was in flight", err)
	case <-time.After(200 * time.Millisecond):
	}
	close(release)
	if code := <-answered; code != http.StatusNoContent {
		t.Fatalf("the request in flight got %d", code)
	}
	select {
	case err := <-served:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Serve did not return after the request was answered")
	}
}

// The grace is the most a shutdown waits: a request that does not end is cut.
func TestServeGraceEnds(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	started, never := make(chan struct{}), make(chan struct{})
	defer close(never)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-never
	})}
	ctx, stop := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() { served <- Serve(ctx, server, listener, 100*time.Millisecond) }()
	go func() {
		if response, err := http.Get("http://" + listener.Addr().String()); err == nil {
			response.Body.Close()
		}
	}()
	<-started
	stop()
	select {
	case <-served:
	case <-time.After(5 * time.Second):
		t.Fatal("Serve waited past the grace")
	}
}
