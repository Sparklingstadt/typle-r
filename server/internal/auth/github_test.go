package auth

import (
	"context"
	"errors"
	"fmt"
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
	if r.Header.Get("Authorization") != "Bearer github_pat_good" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	_, _ = w.Write([]byte(`{"login":"octocat","id":12345}`))
}

func TestOwner(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, users)
	owner, err := g.Owner(context.Background(), "github_pat_good")
	if err != nil || owner != "github:12345" {
		t.Fatalf("owner = %q, %v", owner, err)
	}
	if _, err := g.Owner(context.Background(), "github_pat_bad"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("bad token: %v", err)
	}
}

func TestOnlyFineGrainedTokens(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"id":12345}`)) })
	// OAuth (gho_), app (ghu_, ghs_) and classic (ghp_) tokens, and anything else, are refused before GitHub is asked.
	for _, token := range []string{"gho_abc", "ghu_abc", "ghs_abc", "ghp_abc", "github_pa_abc", "GITHUB_PAT_abc", "abc"} {
		if _, err := g.Owner(context.Background(), token); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s: err = %v", token, err)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("calls = %d, want 0", calls.Load())
	}
	if owner, err := g.Owner(context.Background(), "github_pat_abc"); err != nil || owner != "github:12345" {
		t.Fatalf("fine-grained: owner = %q, %v", owner, err)
	}
}

func TestOwnerIsCached(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, users)
	now := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return now }
	for range 3 {
		if owner, err := g.Owner(context.Background(), "github_pat_good"); err != nil || owner != "github:12345" {
			t.Fatalf("owner = %q, %v", owner, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d, want 1", calls.Load())
	}
	// Refused tokens are not remembered, so a token that becomes valid works at once.
	for range 2 {
		_, _ = g.Owner(context.Background(), "github_pat_bad")
	}
	if calls.Load() != 3 {
		t.Fatalf("calls = %d, want 3", calls.Load())
	}
	// After cacheFor, the token is checked again.
	now = now.Add(cacheFor)
	if _, err := g.Owner(context.Background(), "github_pat_good"); err != nil || calls.Load() != 4 {
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
		if _, err := g.Owner(context.Background(), "github_pat_good"); !errors.Is(err, ErrUnavailable) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	g := NewGitHub()
	g.BaseURL = "http://127.0.0.1:1"
	if _, err := g.Owner(context.Background(), "github_pat_good"); !errors.Is(err, ErrUnavailable) {
		t.Errorf("unreachable: err = %v", err)
	}
}

func TestChecksAreLimited(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, users)
	now := time.Date(2026, 10, 21, 0, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return now }
	if _, err := g.Owner(context.Background(), "github_pat_good"); err != nil {
		t.Fatal(err)
	}
	for i := range maxChecks - 1 {
		if _, err := g.Owner(context.Background(), fmt.Sprintf("github_pat_made_up_%d", i)); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("token %d: err = %v", i, err)
		}
	}
	// The burst is spent: another unknown token is not sent to GitHub, but a cached one still works.
	if _, err := g.Owner(context.Background(), "github_pat_made_up"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("over the limit: err = %v", err)
	}
	if owner, err := g.Owner(context.Background(), "github_pat_good"); err != nil || owner != "github:12345" {
		t.Fatalf("cached: owner = %q, %v", owner, err)
	}
	if calls.Load() != maxChecks {
		t.Fatalf("calls = %d, want %d", calls.Load(), maxChecks)
	}
	// A second later, checksPerSecond more may start.
	now = now.Add(time.Second)
	for i := range checksPerSecond {
		if _, err := g.Owner(context.Background(), fmt.Sprintf("github_pat_later_%d", i)); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("later token %d: err = %v", i, err)
		}
	}
	if _, err := g.Owner(context.Background(), "github_pat_made_up"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("over the limit again: err = %v", err)
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

func TestUserFields(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"id":1,"login":"octo","name":"","avatar_url":"https://a"}`))
	})
	user, err := g.User(context.Background(), "gho_abc")
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != 1 || user.Login != "octo" || user.Name != "" || user.AvatarURL != "https://a" {
		t.Fatalf("user = %+v", user)
	}
	if user.DisplayName() != "octo" || user.Account() != "github:1" {
		t.Fatalf("display = %q, account = %q", user.DisplayName(), user.Account())
	}
}

func TestUserNullFields(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"id":2,"login":"octo","name":null,"avatar_url":null}`))
	})
	user, err := g.User(context.Background(), "gho_abc")
	if err != nil || user.Name != "" || user.AvatarURL != "" || user.DisplayName() != "octo" {
		t.Fatalf("user = %+v, %v", user, err)
	}
}

func TestDisplayName(t *testing.T) {
	for name, tc := range map[string]struct {
		user User
		want string
	}{
		"name":       {User{Login: "octo", Name: "Octo Cat"}, "Octo Cat"},
		"no name":    {User{Login: "octo"}, "octo"},
		"whitespace": {User{Login: "octo", Name: " \t\n"}, "octo"},
	} {
		if got := tc.user.DisplayName(); got != tc.want {
			t.Errorf("%s: DisplayName() = %q, want %q", name, got, tc.want)
		}
	}
}

// User is for the login flow's OAuth App token: no github_pat_ rule, no cache and no limit on checks.
func TestUserAcceptsAnyToken(t *testing.T) {
	var calls atomic.Int32
	g := fakeGitHub(t, &calls, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer gho_good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"id":7,"login":"octo"}`))
	})
	// Owner still refuses the token without calling GitHub.
	if _, err := g.Owner(context.Background(), "gho_good"); !errors.Is(err, ErrInvalidToken) || calls.Load() != 0 {
		t.Fatalf("Owner: err = %v, calls = %d", err, calls.Load())
	}
	// User asks GitHub every time, and more often than the limit on Owner's checks allows.
	for i := range 3 * maxChecks {
		user, err := g.User(context.Background(), "gho_good")
		if err != nil || user.Account() != "github:7" {
			t.Fatalf("call %d: user = %+v, %v", i, user, err)
		}
	}
	if calls.Load() != 3*maxChecks {
		t.Fatalf("calls = %d, want %d", calls.Load(), 3*maxChecks)
	}
	if _, err := g.User(context.Background(), "gho_bad"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("bad token: %v", err)
	}
}

func TestUserUnavailable(t *testing.T) {
	for name, answer := range map[string]func(w http.ResponseWriter, r *http.Request){
		"rate limited": func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) },
		"server error": func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadGateway) },
		"no id":        func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"login":"x"}`)) },
		"not JSON":     func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html>`)) },
	} {
		var calls atomic.Int32
		g := fakeGitHub(t, &calls, answer)
		if _, err := g.User(context.Background(), "gho_good"); !errors.Is(err, ErrUnavailable) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	g := NewGitHub()
	g.BaseURL = "http://127.0.0.1:1"
	if _, err := g.User(context.Background(), "gho_good"); !errors.Is(err, ErrUnavailable) {
		t.Errorf("unreachable: err = %v", err)
	}
}
