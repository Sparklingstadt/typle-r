package web

import (
	"net/http"
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
