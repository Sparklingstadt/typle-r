package web

import (
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

// The gallery writes that need no account are limited per client IP in fixed windows of one minute, counted in the
// database (Store.CountGalleryHit) because every request may be served by another instance. The IP is only ever
// hashed (session.Keys.ClientMAC) before it leaves this file.

const (
	// reportsPerMinute and addedPerMinute are the most POST /api/gallery/reports and POST /api/gallery/added one client
	// may make in a minute.
	reportsPerMinute = 10
	addedPerMinute   = 60
)

// clientIP is where the request comes from. On Vercel it is the first entry of X-Forwarded-For, which Vercel sets, then
// X-Real-Ip, then the connection's address. Anywhere else those headers are written by the client, so only the
// connection's address counts.
func (s *server) clientIP(r *http.Request) string {
	if s.config.OnVercel {
		if first, _, _ := strings.Cut(r.Header.Get("X-Forwarded-For"), ","); strings.TrimSpace(first) != "" {
			return strings.TrimSpace(first)
		}
		if real := strings.TrimSpace(r.Header.Get("X-Real-Ip")); real != "" {
			return real
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// retryAfter is the whole seconds from now until the window ends, rounded up and at least 1.
func retryAfter(windowEnd, now time.Time) int {
	seconds := int((windowEnd.Sub(now) + time.Second - 1) / time.Second)
	return max(seconds, 1)
}

// limited counts one use of action by the request's client, and answers it (429, or 503 when counting fails) when it is
// over limit. It reports whether the request was answered; the caller must then do nothing more.
func (s *server) limited(w http.ResponseWriter, r *http.Request, action string, limit int) bool {
	ip := s.clientIP(r)
	// A spelling of an address that is not canonical (upper case IPv6) is one client, not two.
	if address, err := netip.ParseAddr(ip); err == nil {
		ip = address.Unmap().String()
	}
	hits, windowEnd, err := s.config.Store.CountGalleryHit(r.Context(), action, s.config.Keys.ClientMAC(ip))
	if err != nil {
		s.report(r, err, "gallery.limit")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return true
	}
	if hits > limit {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter(windowEnd, s.now())))
		refuse(w, http.StatusTooManyRequests, "tooManyRequests")
		return true
	}
	return false
}
