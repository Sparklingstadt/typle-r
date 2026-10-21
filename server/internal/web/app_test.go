package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
)

// The iPad app's verifier and its S256 challenge (RFC 7636, appendix B).
const (
	appVerifier  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	appChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
)

// appSignin starts a login as the iPad app does and returns the OAuth cookie and its state.
func (h *loginHarness) appSignin(t *testing.T) (*http.Cookie, session.OAuth) {
	t.Helper()
	response := h.do(http.MethodGet, "/api/auth/signin?client=ipad&code_challenge="+appChallenge+"&returnTo=%2Flists")
	cookie := findCookie(response, session.OAuthCookie)
	if response.Code != http.StatusFound || cookie == nil {
		t.Fatalf("signin = %d %v", response.Code, response.Header())
	}
	opened, ok := h.keys.OpenOAuth(cookie.Value, h.now)
	if !ok || opened.Challenge != appChallenge {
		t.Fatalf("OAuth cookie = %+v, %v", opened, ok)
	}
	// GitHub is given the server's own challenge, not the app's.
	if h.oauth.challenge == appChallenge || h.oauth.challenge != challengeOf(opened.Verifier) {
		t.Fatalf("challenge for GitHub = %q", h.oauth.challenge)
	}
	return &http.Cookie{Name: cookie.Name, Value: cookie.Value}, opened
}

// appLocation reads where a login of the app went back to: typle-r://login with one value.
func appLocation(t *testing.T, response *httptest.ResponseRecorder) url.Values {
	t.Helper()
	location := response.Header().Get("Location")
	if response.Code != http.StatusFound || !strings.HasPrefix(location, appReturn+"?") {
		t.Fatalf("response = %d %q; want a redirect to the app", response.Code, location)
	}
	query, err := url.ParseQuery(strings.TrimPrefix(location, appReturn+"?"))
	if err != nil {
		t.Fatal(err)
	}
	return query
}

func (h *loginHarness) trade(body string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/auth/token", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	for _, f := range change {
		f(r)
	}
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	return response
}

func bearer(token string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token) }
}

func TestAppLogin(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	cookie, opened := h.appSignin(t)
	response := h.callback("code=the-code&state="+url.QueryEscape(opened.State), cookie)
	query := appLocation(t, response)
	if findCookie(response, "typle-session") != nil {
		t.Fatal("the app's login set a session cookie")
	}
	if cleared := findCookie(response, session.OAuthCookie); cleared == nil || cleared.MaxAge >= 0 {
		t.Fatalf("oauth cookie = %+v", cleared)
	}
	code, ok := h.keys.OpenCode(query.Get("code"), h.now)
	if !ok || code.Sub != "github:1" || code.Name != "The Octocat" || code.Challenge != appChallenge ||
		!code.Expires.Equal(h.now.Add(session.AppCodeMaxAge)) || len(query) != 1 {
		t.Fatalf("code = %+v, %v (%v)", code, ok, query)
	}

	traded := h.trade(`{"code":"` + query.Get("code") + `","verifier":"` + appVerifier + `"}`)
	if traded.Code != http.StatusOK || len(traded.Result().Cookies()) != 0 {
		t.Fatalf("token = %d %s %v", traded.Code, traded.Body, traded.Result().Cookies())
	}
	expectPrivate(t, traded)
	body := decodeBody(t, traded)
	if string(body["user"]) != `{"id":"github:1","name":"The Octocat","image":"https://avatars.test/1"}` {
		t.Fatalf("user = %s", body["user"])
	}
	var token string
	if err := jsonString(body["token"], &token); err != nil {
		t.Fatal(err)
	}
	signedIn, ok := h.keys.OpenApp(token, h.now)
	if !ok || signedIn.Sub != "github:1" || !signedIn.Expires.Equal(h.now.Add(session.MaxAge)) {
		t.Fatalf("token = %+v, %v", signedIn, ok)
	}
	// The token is not a cookie, and a cookie is not a token.
	if _, ok := h.keys.Open(token, h.now); ok {
		t.Fatal("the token opens as a session cookie")
	}

	got := h.do(http.MethodGet, "/api/auth/session", bearer(token))
	if strings.TrimSpace(got.Body.String()) != `{"user":{"id":"github:1","name":"The Octocat","image":"https://avatars.test/1"}}` {
		t.Fatalf("session = %s", got.Body)
	}
}

// A login of the app that fails in any way goes back to the app, so its sheet closes, and gives it no code.
func TestAppLoginFails(t *testing.T) {
	for name, fail := range map[string]func(h *loginHarness, state string) string{
		"cancelled":   func(_ *loginHarness, state string) string { return "error=access_denied&state=" + state },
		"wrong state": func(*loginHarness, string) string { return "code=c&state=other" },
		"exchange": func(h *loginHarness, state string) string {
			h.oauth.err = errTooLarge
			return "code=c&state=" + state
		},
	} {
		t.Run(name, func(t *testing.T) {
			h := newLoginHarness(t, testBase, false)
			cookie, opened := h.appSignin(t)
			response := h.callback(fail(h, url.QueryEscape(opened.State)), cookie)
			if query := appLocation(t, response); query.Get("error") != "loginFailed" || len(query) != 1 {
				t.Fatalf("query = %v", query)
			}
			if findCookie(response, "typle-session") != nil {
				t.Fatal("a session was issued")
			}
		})
	}
}

func TestAppSigninRefusesBadChallenge(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	for _, challenge := range []string{"", "short", appChallenge + "A", strings.Replace(appChallenge, "-", "+", 1)} {
		response := h.do(http.MethodGet, "/api/auth/signin?client=ipad&code_challenge="+url.QueryEscape(challenge))
		if query := appLocation(t, response); query.Get("error") != "loginFailed" {
			t.Errorf("%q: query = %v", challenge, query)
		}
		if findCookie(response, session.OAuthCookie) != nil || h.oauth.state != "" {
			t.Errorf("%q: the login started", challenge)
		}
	}
	// Without client=ipad the challenge is not the app's, and the login is the web app's.
	response := h.do(http.MethodGet, "/api/auth/signin?code_challenge="+appChallenge)
	opened, _ := h.keys.OpenOAuth(findCookie(response, session.OAuthCookie).Value, h.now)
	if opened.Challenge != "" || opened.ReturnTo != "/home" {
		t.Fatalf("OAuth cookie = %+v", opened)
	}
}

func TestTokenRefuses(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	valid := session.AppCode{Sub: "github:1", Name: "A", Challenge: appChallenge, Expires: h.now.Add(session.AppCodeMaxAge)}
	code := h.keys.SealCode(valid)
	expired := valid
	expired.Expires = h.now
	for name, body := range map[string]string{
		"wrong verifier":    `{"code":"` + code + `","verifier":"` + strings.Repeat("a", 43) + `"}`,
		"short verifier":    `{"code":"` + code + `","verifier":"abc"}`,
		"no verifier":       `{"code":"` + code + `"}`,
		"expired code":      `{"code":"` + h.keys.SealCode(expired) + `","verifier":"` + appVerifier + `"}`,
		"cookie as code":    `{"code":"` + h.keys.Seal(session.New("github:1", "", "", h.now)) + `","verifier":"` + appVerifier + `"}`,
		"token as code":     `{"code":"` + h.keys.SealApp(session.New("github:1", "", "", h.now)) + `","verifier":"` + appVerifier + `"}`,
		"tampered code":     `{"code":"` + code + `x","verifier":"` + appVerifier + `"}`,
		"not JSON":          `code=` + code,
		"empty":             ``,
		"too large":         `{"code":"` + strings.Repeat("a", maxTokenRequest) + `"}`,
		"verifier as array": `{"code":"` + code + `","verifier":["` + appVerifier + `"]}`,
	} {
		t.Run(name, func(t *testing.T) {
			response := h.trade(body)
			expectError(t, response, http.StatusBadRequest, "loginFailed")
			if len(response.Result().Cookies()) != 0 {
				t.Fatalf("cookies = %v", response.Result().Cookies())
			}
		})
	}
	if response := h.trade(`{"code":"` + code + `","verifier":"` + appVerifier + `"}`); response.Code != http.StatusOK {
		t.Fatalf("the valid code = %d %s", response.Code, response.Body)
	}
}

// An app token that has grown old is renewed in the answer, not with a cookie.
func TestAppSessionRenewal(t *testing.T) {
	h := newLoginHarness(t, testBase, false)
	token := h.keys.SealApp(session.New("github:1", "A", "", h.now))
	if got := h.do(http.MethodGet, "/api/auth/session", bearer(token)); strings.Contains(got.Body.String(), "token") {
		t.Fatalf("a new token was given early: %s", got.Body)
	}
	h.now = h.now.Add(25 * time.Hour)
	response := h.do(http.MethodGet, "/api/auth/session", bearer(token))
	if len(response.Result().Cookies()) != 0 {
		t.Fatalf("cookies = %v", response.Result().Cookies())
	}
	var renewed string
	if err := jsonString(decodeBody(t, response)["token"], &renewed); err != nil {
		t.Fatal(err)
	}
	if got, ok := h.keys.OpenApp(renewed, h.now); !ok || !got.IssuedAt.Equal(h.now) {
		t.Fatalf("renewed = %+v, %v", got, ok)
	}
	// An expired, malformed or refused token is nobody, even with a valid cookie beside it.
	cookie := withCookie(&http.Cookie{Name: "typle-session", Value: h.keys.Seal(session.New("github:2", "", "", h.now))})
	for _, header := range []string{"Bearer " + h.keys.SealApp(session.New("github:1", "", "", h.now.Add(-session.MaxAge))),
		"Bearer", "Bearer ", "Token " + token, "Bearer " + token + " x", "bearer " + token} {
		response := h.do(http.MethodGet, "/api/auth/session", cookie, func(r *http.Request) { r.Header.Set("Authorization", header) })
		if strings.TrimSpace(response.Body.String()) != `{"user":null}` {
			t.Errorf("%q: session = %s", header, response.Body)
		}
	}
}

func TestWorkspaceWithAppToken(t *testing.T) {
	saved := &fakeWorkspaces{saved: &store.Saved{Lists: json.RawMessage("[]"), Devices: json.RawMessage("[]"), Revision: 3}}
	h := newHarness(t, saved, "https://typle.test")
	token := h.keys.SealApp(session.New(testOwner, "", "", time.Now()))
	app := func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer "+token)
	}

	got := h.get("", app)
	if got.Code != http.StatusOK || !strings.Contains(got.Body.String(), `"accountId":"`+testOwner+`"`) {
		t.Fatalf("GET = %d %s", got.Code, got.Body)
	}
	// The app's requests have no Origin, and need none.
	put := h.put("", payload(testOwner, `"revision":3,"lists":[`+aList("a", "A")+`]`), app)
	if put.Code != http.StatusOK || saved.writes != 1 || saved.revision != 3 {
		t.Fatalf("PUT = %d %s (writes %d)", put.Code, put.Body, saved.writes)
	}

	// A token is judged alone: a refused one is not saved by a cookie beside it, and the token's account is the one
	// that must match.
	refused := func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer "+token+"x")
	}
	expectError(t, h.get(testOwner, refused), http.StatusUnauthorized, "loginRequired")
	expectError(t, h.put(testOwner, payload(testOwner, `"revision":4`), refused), http.StatusUnauthorized, "loginRequired")
	expectError(t, h.put("", payload("github:1", `"revision":4`), app), http.StatusUnauthorized, "loginAccountChanged")
	// The Content-Type is still required, and a session cookie's value is not a token.
	expectError(t, h.put("", payload(testOwner, `"revision":4`), app, func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }),
		http.StatusForbidden, "forbiddenRequest")
	cookieAsToken := func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer "+h.keys.Seal(session.New(testOwner, "", "", time.Now())))
	}
	expectError(t, h.get("", cookieAsToken), http.StatusUnauthorized, "loginRequired")
	if saved.writes != 1 {
		t.Fatalf("writes = %d", saved.writes)
	}
}

func jsonString(raw json.RawMessage, into *string) error {
	return json.Unmarshal(raw, into)
}

// The iPad app's requests go through the same checks and answers as the browser's: U+0000 and lone surrogates are
// refused before the store, HEAD is answered as GET, the stored JSON is answered as it is, and the headers are the same.
func TestWorkspaceWithAppTokenChecks(t *testing.T) {
	stored := `[{"id":"a","name":"A","createdAt":"2026-09-06","words":[{"display":"a","input":"a","annotation":""}],"records":[],"extra":{"kept":true}}]`
	fake := &fakeWorkspaces{saved: &store.Saved{Lists: json.RawMessage(stored), Devices: json.RawMessage("[]"), Revision: 3}}
	h := newHarness(t, fake, "https://typle.test")
	token := h.keys.SealApp(session.New(testOwner, "", "", time.Now()))
	app := func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer "+token)
	}

	got := h.get("", app)
	expectPrivate(t, got)
	if got.Code != http.StatusOK || string(decodeBody(t, got)["lists"]) != stored {
		t.Fatalf("GET = %d %s", got.Code, got.Body)
	}
	head := h.request(http.MethodHead, "", "", app)
	expectPrivate(t, head)
	if head.Code != http.StatusOK {
		t.Fatalf("HEAD = %d", head.Code)
	}
	for name, fields := range map[string]string{
		"NUL":            `"revision":3,"lists":[` + aList("one", `a\u0000b`) + `]`,
		"lone surrogate": `"revision":3,"lists":[` + aList("one", `a\ud800b`) + `]`,
	} {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put("", payload(testOwner, fields), app), http.StatusBadRequest, "invalidWorkspace")
		})
	}
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
	put := h.put("", payload(testOwner, `"revision":3,"lists":[`+aList("one", "A")+`]`), app)
	expectPrivate(t, put)
	if put.Code != http.StatusOK || fake.writes != 1 {
		t.Fatalf("PUT = %d %s (writes %d)", put.Code, put.Body, fake.writes)
	}
}
