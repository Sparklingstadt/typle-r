package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func TestAuthorizeURL(t *testing.T) {
	o := NewOAuth("client-id", "client-secret")
	raw := o.AuthorizeURL("the state", "the challenge", "https://app.example/api/auth/callback/github")
	if !strings.HasPrefix(raw, "https://github.com/login/oauth/authorize?") {
		t.Fatalf("url = %s", raw)
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"client_id":             "client-id",
		"redirect_uri":          "https://app.example/api/auth/callback/github",
		"state":                 "the state",
		"code_challenge":        "the challenge",
		"code_challenge_method": "S256",
	}
	query := u.Query()
	for key, value := range want {
		if got := query.Get(key); got != value {
			t.Errorf("%s = %q, want %q", key, got, value)
		}
	}
	if len(query) != len(want) || query.Has("scope") {
		t.Errorf("query = %v, want only %d values and no scope", query, len(want))
	}
	if strings.Contains(raw, "client-secret") {
		t.Error("the authorize URL has the client secret")
	}
}

func fakeTokenServer(t *testing.T, calls *atomic.Int32, answer func(w http.ResponseWriter, r *http.Request)) *OAuth {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		answer(w, r)
	}))
	t.Cleanup(server.Close)
	o := NewOAuth("client-id", "client-secret")
	o.TokenURL = server.URL + "/login/oauth/access_token"
	return o
}

func TestExchange(t *testing.T) {
	var calls atomic.Int32
	o := fakeTokenServer(t, &calls, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/login/oauth/access_token" ||
			r.Header.Get("Accept") != "application/json" ||
			!strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
			t.Errorf("unexpected request %s %s %v", r.Method, r.URL.Path, r.Header)
		}
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		want := url.Values{
			"client_id":     {"client-id"},
			"client_secret": {"client-secret"},
			"code":          {"the code"},
			"code_verifier": {"the verifier"},
			"redirect_uri":  {"https://app.example/cb"},
		}
		if len(r.PostForm) != len(want) {
			t.Errorf("form = %v", r.PostForm)
		}
		for key := range want {
			if r.PostForm.Get(key) != want.Get(key) {
				t.Errorf("%s = %q, want %q", key, r.PostForm.Get(key), want.Get(key))
			}
		}
		_, _ = w.Write([]byte(`{"access_token":"gho_token","token_type":"bearer","scope":""}`))
	})
	token, err := o.Exchange(context.Background(), "the code", "the verifier", "https://app.example/cb")
	if err != nil || token != "gho_token" {
		t.Fatalf("token = %q, %v", token, err)
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d", calls.Load())
	}
}

func TestExchangeFailures(t *testing.T) {
	for name, answer := range map[string]func(w http.ResponseWriter, r *http.Request){
		"error with 200": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"error":"bad_verification_code","error_description":"The code passed is incorrect or expired."}`))
		},
		"error without description": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"error":"bad_verification_code"}`))
		},
		"error and token": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"error":"x","access_token":"gho_token"}`))
		},
		"no token":     func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"token_type":"bearer"}`)) },
		"empty token":  func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"access_token":""}`)) },
		"server error": func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) },
		"error with 400": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"bad_verification_code"}`))
		},
		"not JSON": func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html>`)) },
	} {
		var calls atomic.Int32
		o := fakeTokenServer(t, &calls, answer)
		token, err := o.Exchange(context.Background(), "secret-code", "secret-verifier", "https://app.example/cb")
		if err == nil || token != "" {
			t.Errorf("%s: token = %q, err = %v", name, token, err)
			continue
		}
		// The client secret and the code are never in an error message.
		for _, secret := range []string{"client-secret", "secret-code", "secret-verifier"} {
			if strings.Contains(err.Error(), secret) {
				t.Errorf("%s: error %q has %q", name, err, secret)
			}
		}
	}
}

func TestExchangeErrorNamesGitHubsError(t *testing.T) {
	var calls atomic.Int32
	o := fakeTokenServer(t, &calls, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":"bad_verification_code"}`))
	})
	_, err := o.Exchange(context.Background(), "c", "v", "r")
	if err == nil || !strings.Contains(err.Error(), "bad_verification_code") {
		t.Fatalf("err = %v", err)
	}
}

func TestExchangeUnreachable(t *testing.T) {
	o := NewOAuth("client-id", "client-secret")
	o.TokenURL = "http://127.0.0.1:1/login/oauth/access_token"
	token, err := o.Exchange(context.Background(), "secret-code", "v", "r")
	if err == nil || token != "" {
		t.Fatalf("token = %q, err = %v", token, err)
	}
	if strings.Contains(err.Error(), "client-secret") || strings.Contains(err.Error(), "secret-code") {
		t.Fatalf("error %q has a secret", err)
	}
}

func TestExchangeBodyIsLimited(t *testing.T) {
	var calls atomic.Int32
	o := fakeTokenServer(t, &calls, func(w http.ResponseWriter, _ *http.Request) {
		// A valid answer that starts with more than maxBodyLen of whitespace is cut off before the token.
		_, _ = w.Write([]byte(strings.Repeat(" ", maxBodyLen+1)))
		_, _ = w.Write([]byte(`{"access_token":"gho_token"}`))
	})
	if token, err := o.Exchange(context.Background(), "c", "v", "r"); err == nil {
		t.Fatalf("token = %q, want an error", token)
	}
}

// A redirect is not followed: the POST carries the client secret, and must not be replayed to the target. The 3xx is an
// error, and the target is never called.
func TestExchangeDoesNotFollowRedirects(t *testing.T) {
	for _, status := range []int{http.StatusMovedPermanently, http.StatusFound, http.StatusTemporaryRedirect, http.StatusPermanentRedirect} {
		var target atomic.Int32
		other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			target.Add(1)
			_ = r.ParseForm()
			_, _ = w.Write([]byte(`{"access_token":"gho_stolen"}`))
		}))
		var calls atomic.Int32
		o := fakeTokenServer(t, &calls, func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, other.URL+"/steal", status)
		})
		token, err := o.Exchange(context.Background(), "c", "v", "r")
		other.Close()
		if err == nil || token != "" {
			t.Fatalf("status %d: token = %q, err = %v, want an error", status, token, err)
		}
		if !strings.Contains(err.Error(), "answered") || strings.Contains(err.Error(), "client-secret") {
			t.Errorf("status %d: err = %v", status, err)
		}
		if target.Load() != 0 || calls.Load() != 1 {
			t.Errorf("status %d: the redirect target was called %d times, the token endpoint %d", status, target.Load(), calls.Load())
		}
	}
}
