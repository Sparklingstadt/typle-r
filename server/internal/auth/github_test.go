package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// fakeGitHub serves GET /user with answer and counts the calls.
func fakeGitHub(t *testing.T, calls *atomic.Int32, answer func(w http.ResponseWriter, r *http.Request)) *GitHub {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != http.MethodGet || r.URL.Path != "/user" || r.Header.Get("Accept") != "application/vnd.github+json" ||
			r.Header.Get("X-GitHub-Api-Version") == "" {
			t.Errorf("unexpected request %s %s %v", r.Method, r.URL.Path, r.Header)
		}
		answer(w, r)
	}))
	t.Cleanup(server.Close)
	g := NewGitHub()
	g.BaseURL = server.URL
	return g
}

func users(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer good-token" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	_, _ = w.Write([]byte(`{"login":"octocat","id":12345}`))
}

func TestOwner(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, users)
	owner, err := g.Owner(context.Background(), "good-token")
	if err != nil || owner != "github:12345" {
		t.Fatalf("owner = %q, %v", owner, err)
	}
	if _, err := g.Owner(context.Background(), "bad-token"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("bad token: %v", err)
	}
}

func TestOwnerIsCached(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, users)
	now := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return now }
	for range 3 {
		if owner, err := g.Owner(context.Background(), "good-token"); err != nil || owner != "github:12345" {
			t.Fatalf("owner = %q, %v", owner, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d, want 1", calls.Load())
	}
	// Refused tokens are not remembered, so a token that becomes valid works at once.
	for range 2 {
		_, _ = g.Owner(context.Background(), "bad-token")
	}
	if calls.Load() != 3 {
		t.Fatalf("calls = %d, want 3", calls.Load())
	}
	// After cacheFor, the token is checked again.
	now = now.Add(cacheFor)
	if _, err := g.Owner(context.Background(), "good-token"); err != nil || calls.Load() != 4 {
		t.Fatalf("err = %v, calls = %d", err, calls.Load())
	}
}

func TestOwnerUnavailable(t *testing.T) {
	for name, answer := range map[string]func(w http.ResponseWriter, r *http.Request){
		"rate limited": func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) },
		"server error": func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadGateway) },
		"no id":        func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"login":"x"}`)) },
		"not JSON":     func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html>`)) },
	} {
		var calls atomic.Int32
		g := fakeGitHub(t, &calls, answer)
		if _, err := g.Owner(context.Background(), "good-token"); !errors.Is(err, ErrUnavailable) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	g := NewGitHub()
	g.BaseURL = "http://127.0.0.1:1"
	if _, err := g.Owner(context.Background(), "good-token"); !errors.Is(err, ErrUnavailable) {
		t.Errorf("unreachable: err = %v", err)
	}
}

func TestCacheStaysBounded(t *testing.T) {
	g := NewGitHub()
	for i := range maxCached + 10 {
		g.store([32]byte{byte(i), byte(i >> 8)}, "github:1")
	}
	if len(g.cache) > maxCached {
		t.Fatalf("cache has %d entries", len(g.cache))
	}
}

func TestBearerToken(t *testing.T) {
	good := map[string]string{
		"Bearer abc":       "abc",
		"bearer abc":       "abc",
		"BEARER ghp_x-y.z": "ghp_x-y.z",
		"Bearer  abc ":     "abc",
	}
	for header, want := range good {
		if token, ok := BearerToken(header); !ok || token != want {
			t.Errorf("BearerToken(%q) = %q, %v", header, token, ok)
		}
	}
	for _, header := range []string{"", "Bearer", "Bearer ", "Basic abc", "token abc", "Bearer a b", "Bearer a\tb", "abc"} {
		if token, ok := BearerToken(header); ok {
			t.Errorf("BearerToken(%q) = %q", header, token)
		}
	}
}
