package web

import (
	"errors"
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

// unknownClient is the one client that every request whose IP cannot be told on Vercel is counted as, so that it stays
// limited (fail closed) rather than passing uncounted.
const unknownClient = "unknown"

// clientIP is where the request comes from, and whether it could be told. On Vercel it is the first entry of
// X-Vercel-Forwarded-For, then of X-Forwarded-For, then X-Real-Ip: the first of them that is an IP address, as Vercel
// sets them. When none is, ok is false and the client is unknownClient. Anywhere else those headers are written by the
// client, so only the connection's address counts.
func (s *server) clientIP(r *http.Request) (ip string, ok bool) {
	if s.config.OnVercel {
		for _, name := range []string{"X-Vercel-Forwarded-For", "X-Forwarded-For", "X-Real-Ip"} {
			first, _, _ := strings.Cut(r.Header.Get(name), ",")
			if address, err := netip.ParseAddr(strings.TrimSpace(first)); err == nil {
				return address.Unmap().String(), true
			}
		}
		return unknownClient, false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	// An address that is not canonical (upper case IPv6) is one client, not two.
	if address, err := netip.ParseAddr(host); err == nil {
		host = address.Unmap().String()
	}
	return host, true
}

// retryAfter is the whole seconds from now until the window ends, rounded up and at least 1.
func retryAfter(windowEnd, now time.Time) int {
	seconds := int((windowEnd.Sub(now) + time.Second - 1) / time.Second)
	return max(seconds, 1)
}

// limited counts one use of action by the request's client, and answers it (429, or 503 when counting fails) when it is
// over limit. It reports whether the request was answered; the caller must then do nothing more.
func (s *server) limited(w http.ResponseWriter, r *http.Request, action string, limit int) bool {
	ip, known := s.clientIP(r)
	if !known {
		// Vercel always sets these headers, so this is a change on its side to look into. The request is counted anyway.
		s.report(r, errors.New("no client IP in the forwarding headers"), "gallery.limit.ip")
	}
	hits, windowEnd, err := s.config.Store.CountGalleryHit(r.Context(), action, s.config.Keys.ClientMAC(ip))
	if err != nil {
		s.report(r, err, "gallery.limit")
		refuse(w, http.StatusServiceUnavailable, "databaseUnavailable")
		return true
	}
	if hits > limit {
		// The window comes from the database clock and now from this one: skew only shortens or lengthens the wait within
		// the window, and the floor of 1 second holds.
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter(windowEnd, s.now())))
		refuse(w, http.StatusTooManyRequests, "tooManyRequests")
		return true
	}
	return false
}
