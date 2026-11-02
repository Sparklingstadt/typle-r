package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRetryAfter(t *testing.T) {
	now := time.Date(2026, 11, 2, 12, 0, 30, 500_000_000, time.UTC)
	for name, tc := range map[string]struct {
		end  time.Time
		want int
	}{
		"rounds up":     {now.Add(29*time.Second + 500*time.Millisecond), 30},
		"whole seconds": {now.Add(30 * time.Second), 30},
		"a fraction":    {now.Add(200 * time.Millisecond), 1},
		"now":           {now, 1},
		"past":          {now.Add(-time.Minute), 1},
	} {
		if got := retryAfter(tc.end, now); got != tc.want {
			t.Errorf("%s: retryAfter = %d; want %d", name, got, tc.want)
		}
	}
}

func TestClientIP(t *testing.T) {
	request := func(remote string, header http.Header) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/gallery/reports", nil)
		r.RemoteAddr = remote
		for name, values := range header {
			r.Header[name] = values
		}
		return r
	}
	forwarded := func(value string) http.Header { return http.Header{"X-Forwarded-For": {value}} }
	for name, tc := range map[string]struct {
		vercel bool
		r      *http.Request
		want   string
	}{
		"vercel: first entry":     {true, request("10.0.0.1:443", forwarded("203.0.113.7, 198.51.100.1")), "203.0.113.7"},
		"vercel: trimmed":         {true, request("10.0.0.1:443", forwarded("  203.0.113.7 ,198.51.100.1")), "203.0.113.7"},
		"vercel: single":          {true, request("10.0.0.1:443", forwarded("203.0.113.7")), "203.0.113.7"},
		"vercel: ipv6":            {true, request("10.0.0.1:443", forwarded("2001:db8::1")), "2001:db8::1"},
		"vercel: real ip":         {true, request("10.0.0.1:443", http.Header{"X-Real-Ip": {" 203.0.113.9 "}}), "203.0.113.9"},
		"vercel: forwarded first": {true, request("10.0.0.1:443", http.Header{"X-Forwarded-For": {"203.0.113.7"}, "X-Real-Ip": {"203.0.113.9"}}), "203.0.113.7"},
		"vercel: empty entry":     {true, request("10.0.0.1:443", http.Header{"X-Forwarded-For": {" , 198.51.100.1"}, "X-Real-Ip": {"203.0.113.9"}}), "203.0.113.9"},
		"vercel: no headers":      {true, request("10.0.0.1:443", nil), "10.0.0.1"},
		"local: remote host only": {false, request("127.0.0.1:5000", nil), "127.0.0.1"},
		"local: ipv6 remote":      {false, request("[::1]:5000", nil), "::1"},
		"local: spoofed forwarded": {false, request("127.0.0.1:5000", http.Header{
			"X-Forwarded-For": {"203.0.113.7"}, "X-Real-Ip": {"203.0.113.9"}}), "127.0.0.1"},
		"local: no port": {false, request("192.0.2.5", nil), "192.0.2.5"},
	} {
		s := &server{config: Config{OnVercel: tc.vercel}}
		if got := s.clientIP(tc.r); got != tc.want {
			t.Errorf("%s: clientIP = %q; want %q", name, got, tc.want)
		}
	}
}
