package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
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
	// User asks GitHub every time.
	for i := range 3 {
		user, err := g.User(context.Background(), "gho_good")
		if err != nil || user.Account() != "github:7" {
			t.Fatalf("call %d: user = %+v, %v", i, user, err)
		}
	}
	if calls.Load() != 3 {
		t.Fatalf("calls = %d, want 3", calls.Load())
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
