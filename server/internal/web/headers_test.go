package web

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

var wantSecurityHeaders = map[string]string{
	"Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
	"X-Frame-Options":         "DENY",
	"X-Content-Type-Options":  "nosniff",
	"Referrer-Policy":         "strict-origin-when-cross-origin",
}

func checkSecurityHeaders(t *testing.T, name string, header http.Header) {
	t.Helper()
	for key, want := range wantSecurityHeaders {
		if got := header.Values(key); len(got) != 1 || got[0] != want {
			t.Errorf("%s: %s = %q; want %q", name, key, got, want)
		}
	}
}

// Next.js's headers do not apply to the Go functions on Vercel, so each kind of response carries them itself.
func TestSecurityHeaders(t *testing.T) {
	h := newLoginHarness(t, testBase, true)
	cases := []struct {
		name, method, target string
		status               int
	}{
		{"health", http.MethodGet, "/api/health", http.StatusOK},
		{"workspace without login", http.MethodGet, "/api/workspace", http.StatusUnauthorized},
		{"session", http.MethodGet, "/api/auth/session", http.StatusOK},
		{"redirect", http.MethodGet, "/api/auth/signin?returnTo=" + url.QueryEscape("/lists"), http.StatusFound},
		{"method not allowed", http.MethodDelete, "/api/workspace", http.StatusMethodNotAllowed},
		{"not found", http.MethodGet, "/nowhere", http.StatusNotFound},
	}
	for _, tc := range cases {
		response := h.do(tc.method, tc.target)
		if response.Code != tc.status {
			t.Errorf("%s: status = %d; want %d", tc.name, response.Code, tc.status)
		}
		checkSecurityHeaders(t, tc.name, response.Header())
	}
}

func TestUnavailableSecurityHeaders(t *testing.T) {
	response := get(t, Unavailable("databaseUnavailable"), http.MethodGet, "/api/workspace")
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", response.Code)
	}
	checkSecurityHeaders(t, "unavailable", response.Header())
}

// Every JSON answer, error or not, is written by one helper: not kept by any cache, and varying with the cookie.
func TestJSONHeadersUniform(t *testing.T) {
	h := newLoginHarness(t, testBase, true)
	responses := map[string]*httptest.ResponseRecorder{
		"health":             h.do(http.MethodGet, "/api/health"),
		"not found":          h.do(http.MethodGet, "/nowhere"),
		"method not allowed": h.do(http.MethodDelete, "/api/workspace"),
		"login method":       h.do(http.MethodPut, "/api/auth/session"),
		"token refused":      h.do(http.MethodPost, "/api/auth/token"),
		"unavailable":        get(t, Unavailable("databaseUnavailable"), http.MethodGet, "/api/workspace"),
		"health down":        get(t, New(Config{Store: fakeStore{err: errors.New("down")}}), http.MethodGet, "/api/health"),
		"login missing":      get(t, New(Config{Store: fakeStore{}}), http.MethodGet, "/api/auth/signin"),
		"local login off":    get(t, New(Config{Store: fakeStore{}}), http.MethodPost, "/api/auth/local"),
	}
	for name, response := range responses {
		header := response.Header()
		if header.Get("Content-Type") != "application/json; charset=utf-8" || header.Get("Cache-Control") != "private, no-store" ||
			header.Get("Vary") != "Cookie" {
			t.Errorf("%s: %d %v", name, response.Code, header)
		}
	}
}

// HEAD /api/workspace is answered as GET, and a server leaves the body out.
func TestWorkspaceHead(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{}, testBase)
	server := httptest.NewServer(h.handler)
	defer server.Close()
	request, err := http.NewRequest(http.MethodHead, server.URL+"/api/workspace", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.AddCookie(h.cookie(testOwner, false))
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || len(body) != 0 || response.Header.Get("Cache-Control") != "private, no-store" {
		t.Fatalf("response = %d %q %v", response.StatusCode, body, response.Header)
	}
	if signedOut := h.request(http.MethodHead, "", ""); signedOut.Code != http.StatusUnauthorized {
		t.Fatalf("signed out: %d", signedOut.Code)
	}
}
