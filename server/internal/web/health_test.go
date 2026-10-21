package web

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeStore struct{ err error }

func (f fakeStore) Ping(context.Context) error { return f.err }

func get(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	response := httptest.NewRecorder()
	h.ServeHTTP(response, httptest.NewRequest(method, path, nil))
	return response
}

func TestHealthOK(t *testing.T) {
	response := get(t, New(Config{Store: fakeStore{}}), http.MethodGet, "/api/health")
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("headers = %v", response.Header())
	}
}

// A recorder keeps the body of a HEAD response that a server would drop, so this goes through a real one.
func TestHealthHead(t *testing.T) {
	server := httptest.NewServer(New(Config{Store: fakeStore{}}))
	defer server.Close()
	response, err := server.Client().Head(server.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || len(body) != 0 || response.Header.Get("Cache-Control") != "no-store" ||
		response.Header.Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("response = %d %q %v", response.StatusCode, body, response.Header)
	}
}

func TestHealthDatabaseDown(t *testing.T) {
	response := get(t, New(Config{Store: fakeStore{err: errors.New("connection refused")}}), http.MethodGet, "/api/health")
	if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"databaseUnavailable"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", response.Header())
	}
}

func TestHealthMethod(t *testing.T) {
	response := get(t, New(Config{Store: fakeStore{}}), http.MethodPost, "/api/health")
	if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("response = %d %v", response.Code, response.Header())
	}
}

func TestNotFound(t *testing.T) {
	response := get(t, New(Config{Store: fakeStore{}}), http.MethodGet, "/api/nothing")
	if response.Code != http.StatusNotFound || strings.TrimSpace(response.Body.String()) != `{"error":"notFound"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}
