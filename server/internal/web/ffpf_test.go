package web

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
)

// ffpfSignin goes through /api/auth/signin?provider=ffpf and returns the OAuth cookie it set and what it holds.
func (h *loginHarness) ffpfSignin(t *testing.T, query string) (*http.Cookie, session.OAuth) {
	t.Helper()
	response := h.do(http.MethodGet, "/api/auth/signin?provider=ffpf"+query)
	cookie := findCookie(response, session.OAuthCookie)
	if response.Code != http.StatusFound || cookie == nil {
		t.Fatalf("signin = %d %v", response.Code, response.Header())
	}
	opened, ok := h.keys.OpenOAuth(cookie.Value, h.now)
	if !ok {
		t.Fatal("the OAuth cookie does not open")
	}
	return &http.Cookie{Name: cookie.Name, Value: cookie.Value}, opened
}

func (h *loginHarness) ffpfCallback(query string, cookie *http.Cookie) *httptest.ResponseRecorder {
	if cookie == nil {
		return h.do(http.MethodGet, "/api/auth/callback/ffpf?"+query)
	}
	return h.do(http.MethodGet, "/api/auth/callback/ffpf?"+query, withCookie(cookie))
}

func TestFFPFSignin(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	response := h.do(http.MethodGet, "/api/auth/signin?provider=ffpf&returnTo=%2Fplay")
	if response.Code != http.StatusFound || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("signin = %d %v", response.Code, response.Header())
	}
	if got, want := response.Header().Get("Location"), "https://id.test/oauth/authorize?state="+url.QueryEscape(h.ffpf.state); got != want {
		t.Fatalf("Location = %q; want %q", got, want)
	}
	if h.ffpf.redirectURI != testBase+"/api/auth/callback/ffpf" || h.oauth.state != "" {
		t.Fatalf("redirect_uri = %q, GitHub state = %q", h.ffpf.redirectURI, h.oauth.state)
	}
	cookie := findCookie(response, session.OAuthCookie)
	if cookie == nil || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/api/auth" || cookie.MaxAge != 600 {
		t.Fatalf("cookie = %+v", cookie)
	}
	opened, ok := h.keys.OpenOAuth(cookie.Value, h.now)
	if !ok || opened.Provider != "ffpf" || opened.ReturnTo != "/play" || opened.State != h.ffpf.state || opened.Admin {
		t.Fatalf("OAuth cookie = %+v, %v", opened, ok)
	}
	// The nonce is 32 random bytes, as the state and the verifier are, and is the one FFPF ID was given.
	for name, value := range map[string]string{"state": opened.State, "verifier": opened.Verifier, "nonce": opened.Nonce} {
		if bytes, err := base64.RawURLEncoding.Strict().DecodeString(value); err != nil || len(bytes) != 32 {
			t.Fatalf("%s = %q", name, value)
		}
	}
	if h.ffpf.nonce != opened.Nonce || h.ffpf.challenge != challengeOf(opened.Verifier) {
		t.Fatalf("nonce = %q, challenge = %q", h.ffpf.nonce, h.ffpf.challenge)
	}
	if _, other := h.ffpfSignin(t, ""); other.Nonce == opened.Nonce {
		t.Fatal("the nonce repeated")
	}
}

// Without provider, or with any other value, the login is GitHub's, and its OAuth cookie has neither a provider nor a
// nonce, so it is the same as before FFPF ID.
func TestSigninDefaultsToGitHub(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	for _, query := range []string{"", "?provider=github", "?provider=FFPF", "?provider="} {
		response := h.do(http.MethodGet, "/api/auth/signin"+query)
		if location := response.Header().Get("Location"); !strings.HasPrefix(location, "https://github.test/") {
			t.Fatalf("%q: Location = %q", query, location)
		}
		opened, ok := h.keys.OpenOAuth(findCookie(response, session.OAuthCookie).Value, h.now)
		if !ok || opened.Provider != "" || opened.Nonce != "" {
			t.Fatalf("%q: OAuth cookie = %+v", query, opened)
		}
	}
	if h.ffpf.state != "" {
		t.Fatal("FFPF ID was asked")
	}
}

func TestFFPFCallbackSuccess(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	cookie, opened := h.ffpfSignin(t, "&returnTo=%2Fplay")
	response := h.ffpfCallback("code=the-code&state="+url.QueryEscape(opened.State), cookie)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/play" {
		t.Fatalf("callback = %d %v", response.Code, response.Header())
	}
	if h.ffpf.exchanges != 1 || h.ffpf.code != "the-code" || h.ffpf.verifier != opened.Verifier ||
		h.ffpf.exchangeURI != testBase+"/api/auth/callback/ffpf" || h.ffpf.exchangeNonce != opened.Nonce {
		t.Fatalf("exchange = %+v", h.ffpf)
	}
	set := findCookie(response, "typle-session")
	if set == nil || !set.HttpOnly || set.Path != "/" || set.MaxAge != 30*24*60*60 {
		t.Fatalf("session cookie = %+v", set)
	}
	got, ok := h.keys.Open(set.Value, h.now)
	if !ok || got.Sub != "ffpf:cabc" || got.Name != "FFPF User" || got.Image != "" {
		t.Fatalf("session = %+v, %v", got, ok)
	}
	if cleared := findCookie(response, session.OAuthCookie); cleared == nil || cleared.MaxAge >= 0 {
		t.Fatalf("oauth cookie = %+v", cleared)
	}
	if findCookie(response, session.AdminCookieName(false)) != nil || h.oauth.exchanges != 0 || len(h.reports) != 0 {
		t.Fatalf("admin cookie set, GitHub asked (%d) or reported (%v)", h.oauth.exchanges, h.reports)
	}
}

// A login that one provider started does not finish at the other's callback: nobody is signed in, and neither provider
// is asked for the code.
func TestCallbackOfAnotherProvider(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	github := h.signin(t, "/lists")
	githubState, _ := h.keys.OpenOAuth(github.Value, h.now)
	response := h.ffpfCallback("code=c&state="+url.QueryEscape(githubState.State), github)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/lists" || findCookie(response, "typle-session") != nil {
		t.Fatalf("GitHub's cookie at FFPF ID's callback = %d %v", response.Code, response.Header())
	}
	ffpf, ffpfState := h.ffpfSignin(t, "&returnTo=%2Fplay")
	response = h.callback("code=c&state="+url.QueryEscape(ffpfState.State), ffpf)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/play" || findCookie(response, "typle-session") != nil {
		t.Fatalf("FFPF ID's cookie at GitHub's callback = %d %v", response.Code, response.Header())
	}
	if h.oauth.exchanges != 0 || h.users.calls != 0 || h.ffpf.exchanges != 0 || len(h.reports) != 0 {
		t.Fatalf("exchanges = %d/%d, users = %d, reports = %v", h.oauth.exchanges, h.ffpf.exchanges, h.users.calls, h.reports)
	}
	// A cookie that names a provider nobody knows is refused at both.
	unknown := &http.Cookie{Name: session.OAuthCookie, Value: h.keys.SealOAuth(session.OAuth{
		State: "s", Verifier: strings.Repeat("v", 43), ReturnTo: "/home", Provider: "other", Expires: h.now.Add(time.Minute)})}
	for _, response := range []*httptest.ResponseRecorder{h.callback("code=c&state=s", unknown), h.ffpfCallback("code=c&state=s", unknown)} {
		if findCookie(response, "typle-session") != nil || response.Header().Get("Location") != "/home" {
			t.Fatalf("unknown provider = %d %v", response.Code, response.Header())
		}
	}
}

func TestFFPFCallbackRefuses(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	for name, query := range map[string]func(state string) string{
		"wrong state": func(string) string { return "code=c&state=other" },
		"no code":     func(s string) string { return "state=" + s },
		"cancelled":   func(s string) string { return "error=access_denied&state=" + s },
	} {
		cookie, opened := h.ffpfSignin(t, "&returnTo=%2Fplay")
		response := h.ffpfCallback(query(url.QueryEscape(opened.State)), cookie)
		if response.Header().Get("Location") != "/play" || findCookie(response, "typle-session") != nil {
			t.Fatalf("%s: callback = %d %v", name, response.Code, response.Header())
		}
	}
	if response := h.ffpfCallback("code=c&state=s", nil); response.Header().Get("Location") != "/home" {
		t.Fatalf("no cookie: callback = %d %v", response.Code, response.Header())
	}
	if h.ffpf.exchanges != 0 || len(h.reports) != 0 {
		t.Fatalf("exchanges = %d, reports = %v", h.ffpf.exchanges, h.reports)
	}
}

// When FFPF ID cannot be reached the browser goes back where it was, not to a 500, and the failure is reported once.
// A refusal comes of what the user did (a code used twice, a token for someone else), so it is not reported.
func TestFFPFCallbackFails(t *testing.T) {
	for _, c := range []struct {
		err     error
		reports int
	}{
		{auth.ErrFFPFUnavailable, 1},
		{fmt.Errorf("token: %w", auth.ErrFFPFUnavailable), 1},
		{auth.ErrFFPFRejected, 0},
		{fmt.Errorf("ID token: %w", auth.ErrFFPFRejected), 0},
	} {
		h := newLoginHarness(t, testBase, false)
		h.ffpf.err = c.err
		cookie, opened := h.ffpfSignin(t, "&returnTo=%2Fplay")
		response := h.ffpfCallback("code=c&state="+url.QueryEscape(opened.State), cookie)
		if response.Code != http.StatusFound || response.Header().Get("Location") != "/play" {
			t.Fatalf("%v: callback = %d %v", c.err, response.Code, response.Header())
		}
		if findCookie(response, "typle-session") != nil {
			t.Fatalf("%v: a session was issued", c.err)
		}
		if len(h.reports) != c.reports || (c.reports == 1 && h.reports[0] != "auth.callback") {
			t.Fatalf("%v: reports = %v", c.err, h.reports)
		}
	}
}

// An app's login through FFPF ID ends at typle-r://login with a code that becomes a token for the ffpf: account.
func TestAppLoginWithFFPF(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	cookie, opened := h.ffpfSignin(t, "&client=ipad&code_challenge="+appChallenge)
	if opened.Challenge != appChallenge || opened.Provider != "ffpf" || h.ffpf.challenge != challengeOf(opened.Verifier) {
		t.Fatalf("OAuth cookie = %+v", opened)
	}
	response := h.ffpfCallback("code=c&state="+url.QueryEscape(opened.State), cookie)
	query := appLocation(t, response)
	if findCookie(response, "typle-session") != nil || len(query) != 1 {
		t.Fatalf("the app's login set a session cookie, or %v", query)
	}
	traded := h.trade(`{"code":"` + query.Get("code") + `","verifier":"` + appVerifier + `"}`)
	if traded.Code != http.StatusOK {
		t.Fatalf("token = %d %s", traded.Code, traded.Body)
	}
	if user := string(decodeBody(t, traded)["user"]); user != `{"id":"ffpf:cabc","name":"FFPF User","image":null}` {
		t.Fatalf("user = %s", user)
	}
	// A failed login goes back to the app too.
	h.ffpf.err = auth.ErrFFPFUnavailable
	cookie, opened = h.ffpfSignin(t, "&client=android&code_challenge="+appChallenge)
	if query := appLocation(t, h.ffpfCallback("code=c&state="+url.QueryEscape(opened.State), cookie)); query.Get("error") != "loginFailed" {
		t.Fatalf("query = %v", query)
	}
}

// Without FFPF ID only its login is unavailable: GitHub's still starts, and the session lists GitHub alone.
func TestFFPFUnavailable(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	h.handler = New(Config{Store: fakeStore{}, Keys: h.keys, BaseURL: mustURL(t, testBase), OAuth: h.oauth, GitHub: h.users,
		Now: func() time.Time { return h.now }})
	for _, path := range []string{"/api/auth/signin?provider=ffpf", "/api/auth/signin?admin=1", "/api/auth/callback/ffpf?code=c&state=s"} {
		response := h.do(http.MethodGet, path)
		expectError(t, response, http.StatusServiceUnavailable, "authUnavailable")
		if len(response.Result().Cookies()) != 0 {
			t.Fatalf("%s set cookies: %v", path, response.Result().Cookies())
		}
	}
	if response := h.do(http.MethodGet, "/api/auth/signin"); response.Code != http.StatusFound {
		t.Fatalf("GitHub signin = %d", response.Code)
	}
	if body := strings.TrimSpace(h.do(http.MethodGet, "/api/auth/session").Body.String()); body != `{"user":null,"providers":["github"]}` {
		t.Fatalf("session = %s", body)
	}
	// FFPF ID alone: the GitHub login is unavailable, and the session lists FFPF ID alone.
	h.handler = New(Config{Store: fakeStore{}, Keys: h.keys, BaseURL: mustURL(t, testBase), FFPF: h.ffpf,
		Now: func() time.Time { return h.now }})
	expectError(t, h.do(http.MethodGet, "/api/auth/signin"), http.StatusServiceUnavailable, "authUnavailable")
	if body := strings.TrimSpace(h.do(http.MethodGet, "/api/auth/session").Body.String()); body != `{"user":null,"providers":["ffpf"]}` {
		t.Fatalf("session = %s", body)
	}
}

// The session lists the providers to the signed-in user too.
func TestSessionProviders(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	cookie := &http.Cookie{Name: "typle-session", Value: h.keys.Seal(session.New("ffpf:cabc", "F", "", h.now))}
	body := strings.TrimSpace(h.do(http.MethodGet, "/api/auth/session", withCookie(cookie)).Body.String())
	if body != `{"user":{"id":"ffpf:cabc","name":"F","image":null},"providers":["github","ffpf"]}` {
		t.Fatalf("session = %s", body)
	}
}
