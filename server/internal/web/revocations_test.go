package web

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// revocations is a database that keeps when each account signed out of every device.
type revocations struct {
	fakeWorkspaces
	revokedAt map[string]time.Time
	readErr   error
	revokeErr error
	revoked   []string
	now       func() time.Time
}

func (r *revocations) SessionsRevokedAt(_ context.Context, owner string) (time.Time, error) {
	return r.revokedAt[owner], r.readErr
}

func (r *revocations) RevokeSessions(_ context.Context, owner string) error {
	if r.revokeErr != nil {
		return r.revokeErr
	}
	r.revoked = append(r.revoked, owner)
	r.revokedAt[owner] = r.now()
	return nil
}

// newRevocationHarness is a login harness whose store is r, with a saved workspace to read.
func newRevocationHarness(t *testing.T, r *revocations) *loginHarness {
	t.Helper()
	h := newLoginHarness(t, testBase, false)
	r.now = func() time.Time { return h.now }
	if r.revokedAt == nil {
		r.revokedAt = map[string]time.Time{}
	}
	r.saved = &store.Saved{Lists: []byte("[]"), Devices: []byte("[]"), Revision: 1}
	parsed, _ := url.Parse(testBase)
	h.handler = New(Config{
		Store: r, Keys: h.keys, BaseURL: parsed, OAuth: h.oauth, GitHub: h.users, FFPF: h.ffpf,
		Now:    func() time.Time { return h.now },
		Report: func(_ *http.Request, err error, operation string) { h.reports = append(h.reports, operation) },
	})
	return h
}

func (h *loginHarness) sessionCookie(sub string, issued time.Time) *http.Cookie {
	return &http.Cookie{Name: "typle-session", Value: h.keys.Seal(session.New(sub, "A", "", issued))}
}

// cleared reports whether the response removes the session cookie.
func cleared(response *httptest.ResponseRecorder) bool {
	c := findCookie(response, "typle-session")
	return c != nil && c.MaxAge < 0 && c.Value == ""
}

// A session of a login no later than the account's revocation is refused wherever the account's data is read or
// changed, and a browser's cookie is removed; a login since is let in.
func TestRevokedSessionIsRefused(t *testing.T) {
	r := &revocations{}
	h := newRevocationHarness(t, r)
	before := h.sessionCookie("github:1", h.now.Add(-time.Hour))
	r.revokedAt["github:1"] = h.now.Add(-time.Minute)
	after := h.sessionCookie("github:1", h.now)

	for _, c := range []struct {
		method, path string
		change       []func(*http.Request)
	}{
		{http.MethodGet, "/api/workspace", nil},
		{http.MethodPut, "/api/workspace", []func(*http.Request){withOrigin(testBase), withJSON(`{"revision":1,"accountId":"github:1"}`)}},
		{http.MethodGet, "/api/shares", nil},
		{http.MethodPut, "/api/shares", []func(*http.Request){withOrigin(testBase), withJSON(`{"packId":"p"}`)}},
		{http.MethodDelete, "/api/shares?pack=p", []func(*http.Request){withOrigin(testBase)}},
	} {
		response := h.do(c.method, c.path, append([]func(*http.Request){withCookie(before)}, c.change...)...)
		if response.Code != http.StatusUnauthorized || !strings.Contains(response.Body.String(), "loginRequired") || !cleared(response) {
			t.Errorf("%s %s with a revoked session = %d %s %v", c.method, c.path, response.Code, response.Body, response.Result().Cookies())
		}
	}
	if r.reads != 0 || r.writes != 0 {
		t.Fatalf("a revoked session reached the data: %d reads, %d writes", r.reads, r.writes)
	}
	if response := h.do(http.MethodGet, "/api/workspace", withCookie(after)); response.Code != http.StatusOK || cleared(response) {
		t.Fatalf("a login since the revocation = %d %s", response.Code, response.Body)
	}
	// Another account's revocation is not this one's.
	if response := h.do(http.MethodGet, "/api/workspace", withCookie(h.sessionCookie("github:2", h.now.Add(-time.Hour)))); response.Code != http.StatusOK {
		t.Fatalf("another account = %d %s", response.Code, response.Body)
	}
}

// An app's revoked token is refused too, without a cookie to remove.
func TestRevokedAppTokenIsRefused(t *testing.T) {
	r := &revocations{}
	h := newRevocationHarness(t, r)
	token := h.keys.SealApp(session.New("github:1", "A", "", h.now.Add(-time.Hour)))
	r.revokedAt["github:1"] = h.now.Add(-time.Minute)
	response := h.do(http.MethodGet, "/api/workspace", bearer(token))
	if response.Code != http.StatusUnauthorized || len(response.Result().Cookies()) != 0 {
		t.Fatalf("workspace = %d %s %v", response.Code, response.Body, response.Result().Cookies())
	}
	if got := h.do(http.MethodGet, "/api/auth/session", bearer(token)); !strings.Contains(got.Body.String(), `"user":null`) {
		t.Fatalf("session = %s", got.Body)
	}
}

// When the revocations cannot be read, the data is not served: the database is as good as down.
func TestRevocationsUnreadable(t *testing.T) {
	r := &revocations{readErr: errors.New("down")}
	h := newRevocationHarness(t, r)
	response := h.do(http.MethodGet, "/api/workspace", withCookie(h.sessionCookie("github:1", h.now)))
	if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), "databaseUnavailable") || cleared(response) {
		t.Fatalf("workspace = %d %s", response.Code, response.Body)
	}
	if r.reads != 0 || len(h.reports) != 1 || h.reports[0] != "session.check" {
		t.Fatalf("reads = %d, reports = %v", r.reads, h.reports)
	}
}

// The session's answer names no one for a revoked session, and removes its cookie. When the revocations cannot be read
// at once it goes on without them, as before.
func TestSessionAnswerAndRevocations(t *testing.T) {
	r := &revocations{}
	h := newRevocationHarness(t, r)
	cookie := h.sessionCookie("github:1", h.now.Add(-time.Hour))
	r.revokedAt["github:1"] = h.now.Add(-time.Minute)
	response := h.do(http.MethodGet, "/api/auth/session", withCookie(cookie))
	if !strings.Contains(response.Body.String(), `"user":null`) || !cleared(response) {
		t.Fatalf("revoked session = %s %v", response.Body, response.Result().Cookies())
	}

	keys := h.keys
	parsed, _ := url.Parse(testBase)
	for name, sessions := range map[string]SessionSource{
		"unchecked": uncheckedSessions{},
		"none":      nil,
	} {
		handler := New(Config{Keys: keys, BaseURL: parsed, Sessions: sessions, Now: func() time.Time { return h.now }})
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
		request.AddCookie(cookie)
		handler.ServeHTTP(response, request)
		if !strings.Contains(response.Body.String(), `"id":"github:1"`) || cleared(response) {
			t.Errorf("%s: session = %s", name, response.Body)
		}
	}
}

// uncheckedSessions is the /api/auth part before its database is open.
type uncheckedSessions struct{}

func (uncheckedSessions) SessionsRevokedAt(context.Context, string) (time.Time, error) {
	return time.Time{}, ErrSessionsUnchecked
}

func (uncheckedSessions) RevokeSessions(context.Context, string) error { return nil }

func TestSignoutEverywhere(t *testing.T) {
	const path = "/api/auth/signout?everywhere=1"
	t.Run("from the app's page", func(t *testing.T) {
		r := &revocations{}
		h := newRevocationHarness(t, r)
		cookie := h.sessionCookie("github:1", h.now.Add(-time.Hour))
		response := h.do(http.MethodPost, path, withCookie(cookie), withOrigin(testBase))
		if response.Code != http.StatusNoContent || !cleared(response) || len(r.revoked) != 1 || r.revoked[0] != "github:1" {
			t.Fatalf("signout = %d %s, revoked %v", response.Code, response.Body, r.revoked)
		}
		// The cookie it signed out with, and any other of a login until now, no longer reaches the data.
		h.now = h.now.Add(time.Second)
		if got := h.do(http.MethodGet, "/api/workspace", withCookie(cookie)); got.Code != http.StatusUnauthorized {
			t.Fatalf("workspace after signing out everywhere = %d", got.Code)
		}
		if got := h.do(http.MethodGet, "/api/workspace", withCookie(h.sessionCookie("github:1", h.now))); got.Code != http.StatusOK {
			t.Fatalf("a new login = %d %s", got.Code, got.Body)
		}
	})
	t.Run("from an app", func(t *testing.T) {
		r := &revocations{}
		h := newRevocationHarness(t, r)
		token := h.keys.SealApp(session.New("github:1", "A", "", h.now))
		response := h.do(http.MethodPost, path, bearer(token))
		if response.Code != http.StatusNoContent || len(response.Result().Cookies()) != 0 || len(r.revoked) != 1 {
			t.Fatalf("signout = %d %s %v", response.Code, response.Body, response.Result().Cookies())
		}
	})
	t.Run("refused", func(t *testing.T) {
		r := &revocations{}
		h := newRevocationHarness(t, r)
		cookie := withCookie(h.sessionCookie("github:1", h.now))
		for name, c := range map[string]struct {
			change []func(*http.Request)
			status int
		}{
			"another site":           {[]func(*http.Request){cookie, withOrigin("https://evil.example")}, http.StatusForbidden},
			"no origin":              {[]func(*http.Request){cookie}, http.StatusForbidden},
			"not signed in":          {[]func(*http.Request){withOrigin(testBase)}, http.StatusUnauthorized},
			"an app's refused token": {[]func(*http.Request){bearer("x.y")}, http.StatusUnauthorized},
		} {
			if response := h.do(http.MethodPost, path, c.change...); response.Code != c.status {
				t.Errorf("%s = %d %s", name, response.Code, response.Body)
			}
		}
		if response := h.do(http.MethodGet, path, cookie, withOrigin(testBase)); response.Code != http.StatusMethodNotAllowed {
			t.Errorf("GET = %d", response.Code)
		}
		if len(r.revoked) != 0 {
			t.Fatalf("revoked = %v", r.revoked)
		}
	})
	// A session that is itself revoked cannot move the revocation on, which would sign out the logins made since.
	t.Run("with a revoked session", func(t *testing.T) {
		r := &revocations{}
		h := newRevocationHarness(t, r)
		cookie := h.sessionCookie("github:1", h.now.Add(-time.Hour))
		r.revokedAt["github:1"] = h.now.Add(-time.Minute)
		response := h.do(http.MethodPost, path, withCookie(cookie), withOrigin(testBase))
		if response.Code != http.StatusUnauthorized || !cleared(response) || len(r.revoked) != 0 {
			t.Fatalf("signout = %d %s, revoked %v", response.Code, response.Body, r.revoked)
		}
	})
	// When the database fails the cookie is kept, so that the user can try again.
	t.Run("database down", func(t *testing.T) {
		for name, r := range map[string]*revocations{
			"read":  {readErr: errors.New("down")},
			"write": {revokeErr: errors.New("down")},
		} {
			h := newRevocationHarness(t, r)
			response := h.do(http.MethodPost, path, withCookie(h.sessionCookie("github:1", h.now)), withOrigin(testBase))
			if response.Code != http.StatusServiceUnavailable || findCookie(response, "typle-session") != nil ||
				len(h.reports) != 1 || h.reports[0] != "session.revoke" {
				t.Errorf("%s: signout = %d %s, reports %v", name, response.Code, response.Body, h.reports)
			}
		}
	})
	// Signing out of this browser alone revokes nothing.
	t.Run("this browser only", func(t *testing.T) {
		r := &revocations{}
		h := newRevocationHarness(t, r)
		response := h.do(http.MethodPost, "/api/auth/signout", withCookie(h.sessionCookie("github:1", h.now)), withOrigin(testBase))
		if response.Code != http.StatusNoContent || !cleared(response) || len(r.revoked) != 0 {
			t.Fatalf("signout = %d, revoked %v", response.Code, r.revoked)
		}
	})
}

func withJSON(body string) func(*http.Request) {
	return func(r *http.Request) {
		r.Header.Set("Content-Type", "application/json")
		r.Body = io.NopCloser(strings.NewReader(body))
		r.ContentLength = int64(len(body))
	}
}
