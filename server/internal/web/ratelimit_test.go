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
	h := func(pairs ...string) http.Header {
		header := http.Header{}
		for i := 0; i < len(pairs); i += 2 {
			header.Set(pairs[i], pairs[i+1])
		}
		return header
	}
	for name, tc := range map[string]struct {
		vercel bool
		r      *http.Request
		want   string
		known  bool
	}{
		"vercel: x-vercel first":      {true, request("10.0.0.1:443", h("X-Vercel-Forwarded-For", "203.0.113.1, 198.51.100.1", "X-Forwarded-For", "203.0.113.2", "X-Real-Ip", "203.0.113.3")), "203.0.113.1", true},
		"vercel: x-forwarded second":  {true, request("10.0.0.1:443", h("X-Forwarded-For", "  203.0.113.2 ,198.51.100.1", "X-Real-Ip", "203.0.113.3")), "203.0.113.2", true},
		"vercel: real ip last":        {true, request("10.0.0.1:443", h("X-Real-Ip", " 203.0.113.3 ")), "203.0.113.3", true},
		"vercel: ipv6":                {true, request("10.0.0.1:443", h("X-Forwarded-For", "2001:DB8::1")), "2001:db8::1", true},
		"vercel: unparsable skipped":  {true, request("10.0.0.1:443", h("X-Vercel-Forwarded-For", "not-an-ip", "X-Forwarded-For", "", "X-Real-Ip", "203.0.113.3")), "203.0.113.3", true},
		"vercel: empty first skipped": {true, request("10.0.0.1:443", h("X-Forwarded-For", " , 198.51.100.1", "X-Real-Ip", "203.0.113.3")), "203.0.113.3", true},
		"vercel: no headers":          {true, request("10.0.0.1:443", nil), unknownClient, false},
		"vercel: only garbage":        {true, request("10.0.0.1:443", h("X-Forwarded-For", "x", "X-Real-Ip", "y")), unknownClient, false},
		"local: remote host only":     {false, request("127.0.0.1:5000", nil), "127.0.0.1", true},
		"local: ipv6 remote":          {false, request("[::1]:5000", nil), "::1", true},
		"local: spoofed headers": {false, request("127.0.0.1:5000", h(
			"X-Vercel-Forwarded-For", "203.0.113.1", "X-Forwarded-For", "203.0.113.7", "X-Real-Ip", "203.0.113.9")), "127.0.0.1", true},
		"local: no port": {false, request("192.0.2.5", nil), "192.0.2.5", true},
	} {
		s := &server{config: Config{OnVercel: tc.vercel}}
		if got, known := s.clientIP(tc.r); got != tc.want || known != tc.known {
			t.Errorf("%s: clientIP = %q, %v; want %q, %v", name, got, known, tc.want, tc.known)
		}
	}
}

func TestLimitWithoutClientIP(t *testing.T) {
	fake := &fakeGallery{found: true}
	h := newHarness(t, fake, testBase)
	h.handler = New(Config{Store: fake, Keys: h.keys, BaseURL: mustURL(t, testBase), OnVercel: true, Report: func(r *http.Request, err error, operation string) {
		h.reports = append(h.reports, operation)
	}})
	for i := 1; i <= 11; i++ {
		response := h.shareRequest(http.MethodPost, "/api/gallery/reports", `{"id":"`+aSharedID+`","reason":"spam"}`, "")
		if i <= 10 && response.Code != http.StatusNoContent || i == 11 && response.Code != http.StatusTooManyRequests {
			t.Fatalf("request %d = %d %s", i, response.Code, response.Body)
		}
	}
	if len(h.reports) != 11 || h.reports[0] != "gallery.limit.ip" {
		t.Fatalf("reports = %v", h.reports)
	}
}
