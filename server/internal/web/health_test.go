package web

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

type fakeStore struct{ err error }

func (f fakeStore) Ping(context.Context) error { return f.err }

// The health check does not read workspaces; these only make fakeStore a Store.
func (f fakeStore) ReadRevision(context.Context, string) (*store.Saved, error) { return nil, f.err }

func (f fakeStore) WriteRevision(context.Context, string, int, store.Change) (*store.Saved, error) {
	return nil, f.err
}

func (f fakeStore) Modify(context.Context, string, func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error) {
	return nil, f.err
}

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
	if response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
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
	if response.StatusCode != http.StatusOK || len(body) != 0 || response.Header.Get("Cache-Control") != "private, no-store" ||
		response.Header.Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("response = %d %q %v", response.StatusCode, body, response.Header)
	}
}

func TestHealthDatabaseDown(t *testing.T) {
	response := get(t, New(Config{Store: fakeStore{err: errors.New("connection refused")}}), http.MethodGet, "/api/health")
	if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"databaseUnavailable"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if response.Header().Get("Cache-Control") != "private, no-store" {
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

// Health answers as New does, without any login settings.
func TestHealthAlone(t *testing.T) {
	response := get(t, Health(fakeStore{}), http.MethodGet, "/api/health")
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	checkSecurityHeaders(t, "health", response.Header())
	response = get(t, Health(fakeStore{err: errors.New("down")}), http.MethodGet, "/api/health")
	if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"databaseUnavailable"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

// Nor links.
func (f fakeStore) PutShare(context.Context, string, string) (*store.Share, error) { return nil, f.err }

func (f fakeStore) DeleteShare(context.Context, string, string) error { return f.err }

func (f fakeStore) ListShares(context.Context, string) ([]store.Share, error) { return nil, f.err }

func (f fakeStore) SharedPack(context.Context, string) (json.RawMessage, error) { return nil, f.err }

func (f fakeStore) Admin(context.Context, string, string) (bool, error) { return false, f.err }

func (f fakeStore) Overview(context.Context) (*store.AdminOverview, error) { return nil, f.err }

func (f fakeStore) Users(context.Context, int) (*store.AdminUsers, error) { return nil, f.err }

// No account has signed out of every device, whatever err is, so that a test of another failure fails where it means
// to; revocations_test.go has its own store for them.
func (f fakeStore) SessionsRevokedAt(context.Context, string) (time.Time, error) {
	return time.Time{}, nil
}

func (f fakeStore) RevokeSessions(context.Context, string) error { return f.err }
