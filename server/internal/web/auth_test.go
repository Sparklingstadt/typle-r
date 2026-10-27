package web

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
)

// fakeOAuth stands in for GitHub's OAuth App: it remembers what the handler gave it.
type fakeOAuth struct {
	state, challenge, redirectURI string
	exchanges                     int
	code, verifier, exchangeURI   string
	err                           error
}

func (f *fakeOAuth) AuthorizeURL(state, challenge, redirectURI string) string {
	f.state, f.challenge, f.redirectURI = state, challenge, redirectURI
	return "https://github.test/authorize?state=" + url.QueryEscape(state)
}

func (f *fakeOAuth) Exchange(_ context.Context, code, verifier, redirectURI string) (string, error) {
	f.exchanges++
	f.code, f.verifier, f.exchangeURI = code, verifier, redirectURI
	return "token", f.err
}

type fakeUsers struct {
	user  auth.User
	err   error
	calls int
}

func (f *fakeUsers) User(context.Context, string) (auth.User, error) {
	f.calls++
	return f.user, f.err
}

// fakeFFPF stands in for FFPF ID: it remembers what the handler gave it, and answers user or err.
type fakeFFPF struct {
	state, challenge, nonce, redirectURI string
	exchanges                            int
	code, verifier, exchangeURI          string
	exchangeNonce                        string
	user                                 auth.FFPFUser
	err                                  error
}

func (f *fakeFFPF) AuthorizeURL(state, challenge, nonce, redirectURI string) string {
	f.state, f.challenge, f.nonce, f.redirectURI = state, challenge, nonce, redirectURI
	return "https://id.test/oauth/authorize?state=" + url.QueryEscape(state)
}

func (f *fakeFFPF) Exchange(_ context.Context, code, verifier, redirectURI, nonce string) (auth.FFPFUser, error) {
	f.exchanges++
	f.code, f.verifier, f.exchangeURI, f.exchangeNonce = code, verifier, redirectURI, nonce
	if f.err != nil {
		return auth.FFPFUser{}, f.err
	}
	return f.user, nil
}

type loginHarness struct {
	handler http.Handler
	keys    session.Keys
	oauth   *fakeOAuth
	users   *fakeUsers
	ffpf    *fakeFFPF
	now     time.Time
	reports []string
	secure  bool
}

func newLoginHarness(t *testing.T, base string, localLogin bool) *loginHarness {
	t.Helper()
	keys, err := session.NewKeys("test secret")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	h := &loginHarness{
		keys:   keys,
		oauth:  &fakeOAuth{},
		users:  &fakeUsers{user: auth.User{ID: 1, Login: "octocat", Name: "  The Octocat ", AvatarURL: "https://avatars.test/1"}},
		ffpf:   &fakeFFPF{user: auth.FFPFUser{Sub: "cabc", Email: "user@example.com", Name: " FFPF User "}},
		now:    time.Date(2026, 10, 21, 9, 0, 0, 0, time.UTC),
		secure: parsed.Scheme == "https",
	}
	h.handler = New(Config{
		Store: fakeStore{}, Keys: keys, BaseURL: parsed, OAuth: h.oauth, GitHub: h.users, FFPF: h.ffpf, LocalLogin: localLogin,
		Now:    func() time.Time { return h.now },
		Report: func(_ *http.Request, err error, operation string) { h.reports = append(h.reports, operation) },
	})
	return h
}

func (h *loginHarness) do(method, target string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, target, nil)
	for _, f := range change {
		f(r)
	}
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	return response
}

func withCookie(c *http.Cookie) func(*http.Request) {
	return func(r *http.Request) { r.AddCookie(c) }
}

func withOrigin(origin string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("Origin", origin) }
}

func findCookie(response *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range response.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

// signin goes through /api/auth/signin and returns the OAuth cookie it set, as the browser would send it back.
func (h *loginHarness) signin(t *testing.T, returnTo string) *http.Cookie {
	t.Helper()
	response := h.do(http.MethodGet, "/api/auth/signin?returnTo="+url.QueryEscape(returnTo))
	cookie := findCookie(response, session.OAuthCookie)
	if response.Code != http.StatusFound || cookie == nil {
		t.Fatalf("signin = %d %v", response.Code, response.Header())
	}
	return &http.Cookie{Name: cookie.Name, Value: cookie.Value}
}

func (h *loginHarness) callback(query string, cookie *http.Cookie) *httptest.ResponseRecorder {
	if cookie == nil {
		return h.do(http.MethodGet, "/api/auth/callback/github?"+query)
	}
	return h.do(http.MethodGet, "/api/auth/callback/github?"+query, withCookie(cookie))
}

func (h *loginHarness) sessionCookieName() string { return session.CookieName(h.secure) }

func TestSafeReturnTo(t *testing.T) {
	cases := map[string]string{
		"/lists?x=1":                    "/lists?x=1",
		"/":                             "/",
		"/%2F%2Fevil.example":           "/%2F%2Fevil.example",
		"//evil.example":                "/home",
		`/\evil.example`:                "/home",
		"https://evil.example":          "/home",
		"evil":                          "/home",
		"":                              "/home",
		"/\nevil":                       "/home",
		"/a\x00b":                       "/home",
		"/%zz":                          "/home",
		"/" + strings.Repeat("a", 1023): "/" + strings.Repeat("a", 1023),
		"/" + strings.Repeat("a", 1024): "/home",
	}
	for value, want := range cases {
		if got := safeReturnTo(value); got != want {
			t.Errorf("safeReturnTo(%q) = %q; want %q", value, got, want)
		}
	}
}

func TestSigninRedirects(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	response := h.do(http.MethodGet, "/api/auth/signin?returnTo="+url.QueryEscape("/lists?x=1"))
	if response.Code != http.StatusFound {
		t.Fatalf("status = %d", response.Code)
	}
	if got, want := response.Header().Get("Location"), "https://github.test/authorize?state="+url.QueryEscape(h.oauth.state); got != want {
		t.Fatalf("Location = %q; want %q", got, want)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", response.Header())
	}
	if h.oauth.redirectURI != testBase+"/api/auth/callback/github" {
		t.Fatalf("redirect_uri = %q", h.oauth.redirectURI)
	}
	cookie := findCookie(response, session.OAuthCookie)
	if cookie == nil || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/api/auth" ||
		cookie.MaxAge != 600 || cookie.Secure {
		t.Fatalf("cookie = %+v", cookie)
	}
	opened, ok := h.keys.OpenOAuth(cookie.Value, h.now)
	if !ok {
		t.Fatal("the OAuth cookie does not open")
	}
	if opened.ReturnTo != "/lists?x=1" || opened.State != h.oauth.state || !opened.Expires.Equal(h.now.Add(10*time.Minute)) {
		t.Fatalf("cookie state = %+v", opened)
	}
	// 32 random bytes in base64url without padding are 43 characters, the shortest verifier RFC 7636 allows.
	for name, value := range map[string]string{"state": opened.State, "verifier": opened.Verifier} {
		bytes, err := base64.RawURLEncoding.Strict().DecodeString(value)
		if err != nil || len(bytes) != 32 {
			t.Fatalf("%s = %q", name, value)
		}
	}
	sum := sha256.Sum256([]byte(opened.Verifier))
	if want := base64.RawURLEncoding.EncodeToString(sum[:]); h.oauth.challenge != want {
		t.Fatalf("challenge = %q; want %q", h.oauth.challenge, want)
	}
	if strings.Contains(response.Header().Get("Location"), opened.Verifier) {
		t.Fatal("the verifier is in the URL")
	}
	// Every login has its own state and verifier.
	again := h.signin(t, "/home")
	other, _ := h.keys.OpenOAuth(again.Value, h.now)
	if other.State == opened.State || other.Verifier == opened.Verifier {
		t.Fatal("state or verifier repeated")
	}
}

func TestSigninReturnTo(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	for target, want := range map[string]string{
		"/api/auth/signin": "/home",
		"/api/auth/signin?returnTo=%2F%2Fevil.example":       "/home",
		"/api/auth/signin?returnTo=https%3A%2F%2Fevil.test":  "/home",
		"/api/auth/signin?returnTo=%2Fa&returnTo=%2Fb":       "/a",
		"/api/auth/signin?returnTo=%2F%2Fevil.example%2Fx":   "/home",
		"/api/auth/signin?returnTo=%2F%5Cevil.example":       "/home",
		"/api/auth/signin?returnTo=%2Flists%2Fone%3Fa%3D%26": "/lists/one?a=&",
	} {
		response := h.do(http.MethodGet, target)
		opened, ok := h.keys.OpenOAuth(findCookie(response, session.OAuthCookie).Value, h.now)
		if !ok || opened.ReturnTo != want {
			t.Errorf("%s: returnTo = %q; want %q", target, opened.ReturnTo, want)
		}
	}
}

func TestCallbackSuccess(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	cookie := h.signin(t, "/lists?x=1")
	opened, _ := h.keys.OpenOAuth(cookie.Value, h.now)
	response := h.callback("code=the-code&state="+url.QueryEscape(opened.State), cookie)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/lists?x=1" {
		t.Fatalf("response = %d %v", response.Code, response.Header())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", response.Header())
	}
	if h.oauth.exchanges != 1 || h.oauth.code != "the-code" || h.oauth.verifier != opened.Verifier ||
		h.oauth.exchangeURI != testBase+"/api/auth/callback/github" {
		t.Fatalf("exchange = %+v", h.oauth)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("cookies = %v", cookies)
	}
	set := findCookie(response, "typle-session")
	if set == nil || !set.HttpOnly || set.SameSite != http.SameSiteLaxMode || set.Path != "/" || set.Secure ||
		set.MaxAge != 30*24*60*60 {
		t.Fatalf("session cookie = %+v", set)
	}
	got, ok := h.keys.Open(set.Value, h.now)
	if !ok || got.Sub != "github:1" || got.Name != "The Octocat" || got.Image != "https://avatars.test/1" ||
		!got.IssuedAt.Equal(h.now) || !got.Expires.Equal(h.now.Add(session.MaxAge)) {
		t.Fatalf("session = %+v", got)
	}
	cleared := findCookie(response, session.OAuthCookie)
	if cleared == nil || cleared.Value != "" || cleared.MaxAge >= 0 || cleared.Path != "/api/auth" {
		t.Fatalf("oauth cookie = %+v", cleared)
	}
}

func TestCallbackNameFallsBackToLogin(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	h.users.user = auth.User{ID: 7, Login: " octocat ", Name: "   "}
	cookie := h.signin(t, "/home")
	opened, _ := h.keys.OpenOAuth(cookie.Value, h.now)
	response := h.callback("code=c&state="+opened.State, cookie)
	got, ok := h.keys.Open(findCookie(response, "typle-session").Value, h.now)
	if !ok || got.Sub != "github:7" || got.Name != "octocat" || got.Image != "" {
		t.Fatalf("session = %+v", got)
	}
}

func TestCallbackRefuses(t *testing.T) {
	cases := []struct {
		name     string
		query    func(state string) string
		cookie   func(h *loginHarness, c *http.Cookie) *http.Cookie
		advance  time.Duration
		location string
	}{
		{"wrong state", func(string) string { return "code=c&state=other" }, nil, 0, "/lists"},
		{"no state", func(string) string { return "code=c" }, nil, 0, "/lists"},
		{"empty state", func(string) string { return "code=c&state=" }, nil, 0, "/lists"},
		{"no cookie", func(s string) string { return "code=c&state=" + s }, func(*loginHarness, *http.Cookie) *http.Cookie { return nil }, 0, "/home"},
		{"expired cookie", func(s string) string { return "code=c&state=" + s }, nil, 11 * time.Minute, "/home"},
		{"cancelled", func(s string) string { return "error=access_denied&state=" + s }, nil, 0, "/lists"},
		{"cancelled without state", func(string) string { return "error=access_denied" }, nil, 0, "/lists"},
		{"no code", func(s string) string { return "state=" + s }, nil, 0, "/lists"},
		{"tampered cookie", func(s string) string { return "code=c&state=" + s }, func(_ *loginHarness, c *http.Cookie) *http.Cookie {
			return &http.Cookie{Name: c.Name, Value: c.Value + "x"}
		}, 0, "/home"},
		{"session cookie in place of OAuth", func(s string) string { return "code=c&state=" + s }, func(h *loginHarness, c *http.Cookie) *http.Cookie {
			return &http.Cookie{Name: c.Name, Value: h.keys.Seal(session.New("github:1", "", "", h.now))}
		}, 0, "/home"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newLoginHarness(t, testBase, false)
			cookie := h.signin(t, "/lists")
			opened, _ := h.keys.OpenOAuth(cookie.Value, h.now)
			if tc.cookie != nil {
				cookie = tc.cookie(h, cookie)
			}
			h.now = h.now.Add(tc.advance)
			response := h.callback(tc.query(url.QueryEscape(opened.State)), cookie)
			if response.Code != http.StatusFound || response.Header().Get("Location") != tc.location {
				t.Fatalf("response = %d %v; want a redirect to %s", response.Code, response.Header(), tc.location)
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("headers = %v", response.Header())
			}
			if findCookie(response, "typle-session") != nil {
				t.Fatal("a session was issued")
			}
			if cleared := findCookie(response, session.OAuthCookie); cleared == nil || cleared.MaxAge >= 0 || cleared.Path != "/api/auth" {
				t.Fatalf("oauth cookie = %+v", cleared)
			}
			if h.oauth.exchanges != 0 || h.users.calls != 0 || len(h.reports) != 0 {
				t.Fatalf("exchanges = %d, users = %d, reports = %v", h.oauth.exchanges, h.users.calls, h.reports)
			}
		})
	}
}

func TestCallbackGitHubFails(t *testing.T) {
	for name, fail := range map[string]func(h *loginHarness){
		"exchange": func(h *loginHarness) { h.oauth.err = errors.New("GitHub refused the code: bad_verification_code") },
		"user":     func(h *loginHarness) { h.users.err = auth.ErrUnavailable },
	} {
		t.Run(name, func(t *testing.T) {
			h := newLoginHarness(t, testBase, false)
			fail(h)
			cookie := h.signin(t, "/lists")
			opened, _ := h.keys.OpenOAuth(cookie.Value, h.now)
			response := h.callback("code=c&state="+opened.State, cookie)
			if response.Code != http.StatusFound || response.Header().Get("Location") != "/lists" {
				t.Fatalf("response = %d %v", response.Code, response.Header())
			}
			if findCookie(response, "typle-session") != nil {
				t.Fatal("a session was issued")
			}
			if cleared := findCookie(response, session.OAuthCookie); cleared == nil || cleared.MaxAge >= 0 {
				t.Fatalf("oauth cookie = %+v", cleared)
			}
			if len(h.reports) != 1 || h.reports[0] != "auth.callback" {
				t.Fatalf("reports = %v", h.reports)
			}
			if body := response.Body.String(); strings.Contains(body, "bad_verification_code") {
				t.Fatalf("body = %q", body)
			}
		})
	}
}

// The reported error must not hold what is secret: the code, the verifier, the state or a cookie.
func TestCallbackReportsNoSecret(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	var reported error
	h.handler = New(Config{Store: fakeStore{}, Keys: h.keys, BaseURL: mustURL(t, testBase), OAuth: h.oauth, GitHub: h.users,
		Now:    func() time.Time { return h.now },
		Report: func(_ *http.Request, err error, _ string) { reported = err }})
	h.oauth.err = errors.New("GitHub token request answered 502")
	cookie := h.signin(t, "/lists")
	opened, _ := h.keys.OpenOAuth(cookie.Value, h.now)
	h.callback("code=very-secret-code&state="+opened.State, cookie)
	if reported == nil {
		t.Fatal("nothing reported")
	}
	for _, secret := range []string{"very-secret-code", opened.Verifier, opened.State, cookie.Value} {
		if strings.Contains(reported.Error(), secret) {
			t.Fatalf("the report holds a secret: %v", reported)
		}
	}
}

func mustURL(t *testing.T, value string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func TestSession(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	issue := func(age time.Duration, name, image string) *http.Cookie {
		return &http.Cookie{Name: "typle-session", Value: h.keys.Seal(session.New("github:1", name, image, h.now.Add(-age)))}
	}
	t.Run("signed out", func(t *testing.T) {
		response := h.do(http.MethodGet, "/api/auth/session")
		if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != `{"user":null,"providers":["github","ffpf"]}` {
			t.Fatalf("response = %d %s", response.Code, response.Body)
		}
		expectPrivate(t, response)
		if len(response.Result().Cookies()) != 0 {
			t.Fatalf("cookies = %v", response.Result().Cookies())
		}
	})
	t.Run("auth.js cookie only", func(t *testing.T) {
		response := h.do(http.MethodGet, "/api/auth/session", withCookie(&http.Cookie{Name: "authjs.session-token", Value: "x"}))
		if strings.TrimSpace(response.Body.String()) != `{"user":null,"providers":["github","ffpf"]}` {
			t.Fatalf("body = %s", response.Body)
		}
	})
	t.Run("signed in", func(t *testing.T) {
		response := h.do(http.MethodGet, "/api/auth/session", withCookie(issue(time.Hour, "Octo", "https://avatars.test/1")))
		want := `{"user":{"id":"github:1","name":"Octo","image":"https://avatars.test/1"},"providers":["github","ffpf"]}`
		if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want {
			t.Fatalf("response = %d %s", response.Code, response.Body)
		}
		expectPrivate(t, response)
		if response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
			t.Fatalf("headers = %v", response.Header())
		}
		if len(response.Result().Cookies()) != 0 {
			t.Fatalf("a young session was renewed: %v", response.Result().Cookies())
		}
	})
	t.Run("no image", func(t *testing.T) {
		response := h.do(http.MethodGet, "/api/auth/session", withCookie(issue(time.Hour, "Octo", "")))
		want := `{"user":{"id":"github:1","name":"Octo","image":null},"providers":["github","ffpf"]}`
		if strings.TrimSpace(response.Body.String()) != want {
			t.Fatalf("body = %s", response.Body)
		}
	})
	t.Run("not renewed, however old", func(t *testing.T) {
		response := h.do(http.MethodGet, "/api/auth/session", withCookie(issue(29*24*time.Hour, "Octo", "https://avatars.test/1")))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"id":"github:1"`) {
			t.Fatalf("response = %d %s", response.Code, response.Body)
		}
		expectPrivate(t, response)
		if len(response.Result().Cookies()) != 0 {
			t.Fatalf("an old session was renewed: %v", response.Result().Cookies())
		}
	})
	t.Run("expired", func(t *testing.T) {
		response := h.do(http.MethodGet, "/api/auth/session", withCookie(issue(31*24*time.Hour, "Octo", "")))
		if strings.TrimSpace(response.Body.String()) != `{"user":null,"providers":["github","ffpf"]}` || len(response.Result().Cookies()) != 0 {
			t.Fatalf("response = %s %v", response.Body, response.Result().Cookies())
		}
	})
}

func TestSignout(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	signedIn := withCookie(&http.Cookie{Name: "typle-session", Value: h.keys.Seal(session.New("github:1", "", "", h.now))})
	for name, origin := range map[string]func(*http.Request){
		"other origin": withOrigin("http://evil.example"),
		"no origin":    func(*http.Request) {},
	} {
		t.Run(name, func(t *testing.T) {
			response := h.do(http.MethodPost, "/api/auth/signout", signedIn, origin)
			expectError(t, response, http.StatusForbidden, "forbiddenRequest")
			if len(response.Result().Cookies()) != 0 {
				t.Fatalf("cookies = %v", response.Result().Cookies())
			}
		})
	}
	response := h.do(http.MethodPost, "/api/auth/signout", signedIn, withOrigin(testBase))
	if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
		t.Fatalf("response = %d %q", response.Code, response.Body)
	}
	expectPrivate(t, response)
	cleared := findCookie(response, "typle-session")
	if cleared == nil || cleared.Value != "" || cleared.MaxAge >= 0 || cleared.Path != "/" || !cleared.HttpOnly {
		t.Fatalf("cookie = %+v", cleared)
	}
}

func TestLocalLogin(t *testing.T) {
	t.Run("off", func(t *testing.T) {
		h := newLoginHarness(t, testBase, false)
		response := h.do(http.MethodPost, "/api/auth/local", withOrigin(testBase))
		if response.Code != http.StatusNotFound || strings.TrimSpace(response.Body.String()) != `{"error":"notFound"}` {
			t.Fatalf("response = %d %s", response.Code, response.Body)
		}
		if len(response.Result().Cookies()) != 0 {
			t.Fatalf("cookies = %v", response.Result().Cookies())
		}
	})
	t.Run("on", func(t *testing.T) {
		h := newLoginHarness(t, testBase, true)
		response := h.do(http.MethodPost, "/api/auth/local", withOrigin(testBase))
		if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
			t.Fatalf("response = %d %q", response.Code, response.Body)
		}
		set := findCookie(response, "typle-session")
		if set == nil || !set.HttpOnly || set.SameSite != http.SameSiteLaxMode || set.Path != "/" || set.MaxAge != 30*24*60*60 {
			t.Fatalf("cookie = %+v", set)
		}
		got, ok := h.keys.Open(set.Value, h.now)
		if !ok || got.Sub != "github:0" || got.Name != "ローカル練習用" || got.Image != "" {
			t.Fatalf("session = %+v", got)
		}
	})
	t.Run("other origin", func(t *testing.T) {
		h := newLoginHarness(t, testBase, true)
		for _, change := range []func(*http.Request){withOrigin("http://evil.example"), func(*http.Request) {}} {
			response := h.do(http.MethodPost, "/api/auth/local", change)
			expectError(t, response, http.StatusForbidden, "forbiddenRequest")
			if len(response.Result().Cookies()) != 0 {
				t.Fatalf("cookies = %v", response.Result().Cookies())
			}
		}
	})
}

func TestCookieName(t *testing.T) {
	for base, secure := range map[string]bool{"https://typle.example": true, "http://localhost:3000": false} {
		t.Run(base, func(t *testing.T) {
			h := newLoginHarness(t, base, true)
			name := "typle-session"
			if secure {
				name = "__Host-typle-session"
			}
			check := func(label string, response *httptest.ResponseRecorder, cookieName string) {
				t.Helper()
				c := findCookie(response, cookieName)
				if c == nil || c.Secure != secure {
					t.Fatalf("%s: cookie = %+v", label, c)
				}
			}
			cookie := h.signin(t, "/home")
			opened, _ := h.keys.OpenOAuth(cookie.Value, h.now)
			response := h.callback("code=c&state="+opened.State, cookie)
			check("callback session", response, name)
			check("callback oauth", response, session.OAuthCookie)
			check("signin", h.do(http.MethodGet, "/api/auth/signin"), session.OAuthCookie)
			sessionCookie := &http.Cookie{Name: name, Value: findCookie(response, name).Value}
			// The cookie is read and cleared under the same name.
			if got := h.do(http.MethodGet, "/api/auth/session", withCookie(sessionCookie)); !strings.Contains(got.Body.String(), `"id":"github:1"`) {
				t.Fatalf("session = %s", got.Body)
			}
			origin := withOrigin(base)
			check("signout", h.do(http.MethodPost, "/api/auth/signout", origin), name)
			check("local", h.do(http.MethodPost, "/api/auth/local", origin), name)
		})
	}
}

func TestAuthMethods(t *testing.T) {
	h := newLoginHarness(t, testBase, true)
	// signin and callback are GET alone: a HEAD must not set a cookie, call GitHub or sign anyone in.
	for path, allow := range map[string]string{
		"/api/auth/signin":          "GET",
		"/api/auth/callback/github": "GET",
		"/api/auth/callback/ffpf":   "GET",
		"/api/auth/session":         "GET, HEAD",
		"/api/auth/signout":         "POST",
		"/api/auth/local":           "POST",
		"/api/auth/token":           "POST",
	} {
		methods := []string{http.MethodPut, http.MethodDelete}
		if allow == "POST" {
			methods = append(methods, http.MethodGet, http.MethodHead)
		} else {
			methods = append(methods, http.MethodPost)
		}
		if allow == "GET" {
			methods = append(methods, http.MethodHead)
		}
		for _, method := range methods {
			response := h.do(method, path, withOrigin(testBase))
			if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != allow ||
				strings.TrimSpace(response.Body.String()) != `{"error":"methodNotAllowed"}` {
				t.Errorf("%s %s = %d %v %s", method, path, response.Code, response.Header(), response.Body)
			}
			if len(response.Result().Cookies()) != 0 {
				t.Errorf("%s %s set cookies: %v", method, path, response.Result().Cookies())
			}
		}
	}
	if response := h.do(http.MethodHead, "/api/auth/session"); response.Code != http.StatusOK {
		t.Errorf("HEAD session = %d", response.Code)
	}
	if h.oauth.exchanges != 0 || h.users.calls != 0 || h.oauth.state != "" || h.ffpf.exchanges != 0 {
		t.Error("a refused method reached GitHub or FFPF ID")
	}
}

// Without the OAuth App or the base URL there is nothing to log in with: the request is answered with a 503 and
// nothing is set, not a panic. It is logged, not reported, so that it does not flood the error tracker.
func TestLoginUnavailable(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	for name, config := range map[string]Config{
		"no OAuth":   {Store: fakeStore{}, Keys: h.keys, BaseURL: mustURL(t, testBase), GitHub: h.users},
		"no GitHub":  {Store: fakeStore{}, Keys: h.keys, BaseURL: mustURL(t, testBase), OAuth: h.oauth},
		"no BaseURL": {Store: fakeStore{}, Keys: h.keys, OAuth: h.oauth, GitHub: h.users},
	} {
		t.Run(name, func(t *testing.T) {
			reported := 0
			config.Report = func(*http.Request, error, string) { reported++ }
			handler := New(config)
			for _, path := range []string{"/api/auth/signin", "/api/auth/callback/github?code=c&state=s"} {
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
				expectError(t, response, http.StatusServiceUnavailable, "authUnavailable")
				if len(response.Result().Cookies()) != 0 {
					t.Errorf("%s set cookies: %v", path, response.Result().Cookies())
				}
			}
			if reported != 0 {
				t.Errorf("reported %d times", reported)
			}
		})
	}
}
