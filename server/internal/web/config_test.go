package web

import (
	"bytes"
	"io"
	"log"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
)

func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func validEnv() map[string]string {
	return map[string]string{
		"AUTH_SECRET": "secret", "AUTH_URL": "https://typle.example", "AUTH_GITHUB_ID": "id", "AUTH_GITHUB_SECRET": "client-secret",
	}
}

func TestFromEnvBuildsConfig(t *testing.T) {
	config, err := FromEnv(env(validEnv()), false)
	if err != nil {
		t.Fatal(err)
	}
	if config.BaseURL == nil || config.BaseURL.String() != "https://typle.example" {
		t.Fatalf("BaseURL = %v", config.BaseURL)
	}
	if config.OAuth == nil || config.GitHub == nil {
		t.Fatal("the login is not set up")
	}
	if config.Store != nil || config.LocalLogin || config.Report != nil {
		t.Fatalf("FromEnv set more than the settings: %+v", config)
	}
	// The keys come from NewKeys: sealing must not panic.
	if value := config.Keys.Seal(session.New("github:1", "n", "", time.Now())); value == "" {
		t.Fatal("empty cookie")
	}
}

func TestFromEnvMissing(t *testing.T) {
	for _, name := range []string{"AUTH_SECRET", "AUTH_URL"} {
		values := validEnv()
		delete(values, name)
		_, err := FromEnv(env(values), false)
		if err == nil || !strings.Contains(err.Error(), name) {
			t.Errorf("without %s: err = %v", name, err)
		}
	}
	// Every missing name is told, not only the first.
	_, err := FromEnv(env(nil), false)
	if err == nil {
		t.Fatal("no error")
	}
	for _, name := range []string{"AUTH_SECRET", "AUTH_URL"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("err = %v, want %s", err, name)
		}
	}
}

// The GitHub OAuth App is optional: without it the config is built with OAuth and GitHub nil (really nil, not a nil
// pointer in an interface), and one warning is logged.
func TestFromEnvWithoutGitHub(t *testing.T) {
	for _, missing := range [][]string{{"AUTH_GITHUB_ID"}, {"AUTH_GITHUB_SECRET"}, {"AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"}} {
		values := validEnv()
		for _, name := range missing {
			delete(values, name)
		}
		var logged bytes.Buffer
		log.SetOutput(&logged)
		config, err := FromEnv(env(values), true)
		log.SetOutput(os.Stderr)
		if err != nil {
			t.Errorf("without %v: %v", missing, err)
			continue
		}
		if config.OAuth != nil || config.GitHub != nil {
			t.Errorf("without %v: OAuth = %v, GitHub = %v, want nil", missing, config.OAuth, config.GitHub)
		}
		if config.BaseURL == nil || config.Keys.Seal(session.New("github:1", "n", "", time.Now())) == "" {
			t.Errorf("without %v: the session settings are not built", missing)
		}
		if got := strings.Count(logged.String(), "AUTH_GITHUB_ID and AUTH_GITHUB_SECRET"); got != 1 {
			t.Errorf("without %v: %d warnings (%q), want 1", missing, got, logged.String())
		}
	}
	// With both there is no warning.
	var logged bytes.Buffer
	log.SetOutput(&logged)
	_, err := FromEnv(env(validEnv()), false)
	log.SetOutput(os.Stderr)
	if err != nil || logged.Len() != 0 {
		t.Errorf("with GitHub: err = %v, log = %q", err, logged.String())
	}
}

// FFPF ID is on with all three of its settings, and the issuer's trailing slash is dropped. With one or two of them it
// is off, with one warning and no error; with none it is off without a word, as it is simply not used.
func TestFromEnvFFPF(t *testing.T) {
	values := validEnv()
	values["FFPF_ID_ISSUER"] = "https://portal.example/"
	values["FFPF_ID_CLIENT_ID"] = "typle"
	values["FFPF_ID_CLIENT_SECRET"] = "ffpf-secret"
	config, err := FromEnv(env(values), false)
	if err != nil {
		t.Fatal(err)
	}
	ffpf, ok := config.FFPF.(*auth.FFPF)
	if !ok || ffpf.Issuer != "https://portal.example" || ffpf.ClientID != "typle" || ffpf.ClientSecret != "ffpf-secret" {
		t.Fatalf("FFPF = %#v", config.FFPF)
	}
	// The redirect_uri FFPF ID is given is the callback at AUTH_URL's origin.
	response := httptest.NewRecorder()
	New(config).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/auth/signin?provider=ffpf", nil))
	location := response.Header().Get("Location")
	if !strings.HasPrefix(location, "https://portal.example/oauth/authorize?") ||
		!strings.Contains(location, "redirect_uri="+url.QueryEscape("https://typle.example/api/auth/callback/ffpf")) {
		t.Fatalf("Location = %s", location)
	}

	for _, missing := range [][]string{{"FFPF_ID_ISSUER"}, {"FFPF_ID_CLIENT_ID"}, {"FFPF_ID_CLIENT_SECRET"},
		{"FFPF_ID_ISSUER", "FFPF_ID_CLIENT_SECRET"}, {"FFPF_ID_ISSUER", "FFPF_ID_CLIENT_ID", "FFPF_ID_CLIENT_SECRET"}} {
		partial := maps.Clone(values)
		for _, name := range missing {
			delete(partial, name)
		}
		var logged bytes.Buffer
		log.SetOutput(&logged)
		config, err := FromEnv(env(partial), false)
		log.SetOutput(os.Stderr)
		if err != nil || config.FFPF != nil {
			t.Errorf("without %v: FFPF = %v, err = %v", missing, config.FFPF, err)
		}
		want := 1
		if len(missing) == 3 {
			want = 0
		}
		if got := strings.Count(logged.String(), "FFPF_ID_ISSUER, FFPF_ID_CLIENT_ID and FFPF_ID_CLIENT_SECRET"); got != want {
			t.Errorf("without %v: %d warnings (%q), want %d", missing, got, logged.String(), want)
		}
	}
}

// Without the GitHub OAuth App only the GitHub login is unavailable: the session, the workspace and the local login work.
func TestWithoutGitHubOnlySigninIsUnavailable(t *testing.T) {
	values := validEnv()
	delete(values, "AUTH_GITHUB_ID")
	delete(values, "AUTH_GITHUB_SECRET")
	values["AUTH_URL"] = "http://127.0.0.1:3000"
	values["LOCAL_DEVELOPMENT_LOGIN"] = "1"
	log.SetOutput(io.Discard)
	config, err := FromEnv(env(values), true)
	log.SetOutput(os.Stderr)
	if err != nil {
		t.Fatal(err)
	}
	config.Store = fakeStore{}
	handler := New(config)
	do := func(method, path string, cookie *http.Cookie) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, nil)
		request.Header.Set("Origin", "http://127.0.0.1:3000")
		if cookie != nil {
			request.AddCookie(cookie)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	expectError(t, do(http.MethodGet, "/api/auth/signin", nil), http.StatusServiceUnavailable, "authUnavailable")
	expectError(t, do(http.MethodGet, "/api/auth/callback/github?code=c&state=s", nil), http.StatusServiceUnavailable, "authUnavailable")
	if response := do(http.MethodGet, "/api/auth/session", nil); response.Code != http.StatusOK ||
		strings.TrimSpace(response.Body.String()) != `{"user":null,"providers":[]}` {
		t.Fatalf("session = %d %s", response.Code, response.Body)
	}
	local := do(http.MethodPost, "/api/auth/local", nil)
	if local.Code >= 300 {
		t.Fatalf("local login = %d %s", local.Code, local.Body)
	}
	cookie := findCookie(local, "typle-session")
	if cookie == nil {
		t.Fatalf("local login set no session: %v", local.Result().Cookies())
	}
	if response := do(http.MethodGet, "/api/workspace", cookie); response.Code != http.StatusOK {
		t.Fatalf("workspace = %d %s", response.Code, response.Body)
	}
}

func TestFromEnvInvalidURL(t *testing.T) {
	for _, value := range []string{"ftp://x", "typle.example", "https://", "http:///path", "://x", "javascript:alert(1)"} {
		values := validEnv()
		values["AUTH_URL"] = value
		_, err := FromEnv(env(values), false)
		if err == nil || !strings.Contains(err.Error(), "AUTH_URL") {
			t.Errorf("AUTH_URL=%q: err = %v", value, err)
		}
	}
	for _, value := range []string{"http://localhost:3000", "https://typle.example/app/"} {
		values := validEnv()
		values["AUTH_URL"] = value
		if _, err := FromEnv(env(values), false); err != nil {
			t.Errorf("AUTH_URL=%q: %v", value, err)
		}
	}
}

// Only the origin of AUTH_URL is kept: the functions live at the domain root, so the callback is always
// <origin>/api/auth/callback/github, and sameOrigin compares origins.
func TestFromEnvKeepsOnlyTheOrigin(t *testing.T) {
	for value, want := range map[string]string{
		"https://typle.example":                    "https://typle.example",
		"https://typle.example/":                   "https://typle.example",
		"https://typle.example/app/":               "https://typle.example",
		"https://typle.example/api/auth":           "https://typle.example",
		"https://typle.example:8443/a?b=c#d":       "https://typle.example:8443",
		"http://127.0.0.1:3000/api/auth/?x=1#frag": "http://127.0.0.1:3000",
	} {
		values := validEnv()
		values["AUTH_URL"] = value
		config, err := FromEnv(env(values), false)
		if err != nil {
			t.Errorf("AUTH_URL=%q: %v", value, err)
			continue
		}
		if config.BaseURL.String() != want {
			t.Errorf("AUTH_URL=%q: BaseURL = %s, want %s", value, config.BaseURL, want)
		}
		// The redirect_uri GitHub is given.
		response := httptest.NewRecorder()
		New(config).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/auth/signin", nil))
		wantURI := url.QueryEscape(want + "/api/auth/callback/github")
		if location := response.Header().Get("Location"); !strings.Contains(location, "redirect_uri="+wantURI) {
			t.Errorf("AUTH_URL=%q: Location = %s, want redirect_uri=%s", value, location, wantURI)
		}
	}
}

func TestFromEnvLocalLogin(t *testing.T) {
	cases := []struct {
		name  string
		local bool
		set   map[string]string
		want  bool
	}{
		{"loopback ip", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://127.0.0.1:3000"}, true},
		{"localhost", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://localhost:3000"}, true},
		{"ipv6 loopback", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://[::1]:3000"}, true},
		{"uppercase localhost", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://LOCALHOST:3000"}, true},
		{"not enabled", true, map[string]string{"AUTH_URL": "http://127.0.0.1:3000"}, false},
		{"enabled with 0", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "0", "AUTH_URL": "http://127.0.0.1:3000"}, false},
		{"https", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "https://127.0.0.1:3000"}, false},
		{"public host", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://typle.example"}, false},
		{"lan with host", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://192.168.1.2:3000", "LOCAL_DEVELOPMENT_LAN_HOST": "192.168.1.2"}, true},
		{"lan 10/8", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://10.1.2.3:3000", "LOCAL_DEVELOPMENT_LAN_HOST": "10.1.2.3"}, true},
		{"lan 172.16/12", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://172.31.0.9:3000", "LOCAL_DEVELOPMENT_LAN_HOST": "172.31.0.9"}, true},
		{"lan without host", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://192.168.1.2:3000"}, false},
		{"lan with another host", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://192.168.1.2:3000", "LOCAL_DEVELOPMENT_LAN_HOST": "192.168.1.3"}, false},
		{"172.32 is public", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://172.32.0.9:3000", "LOCAL_DEVELOPMENT_LAN_HOST": "172.32.0.9"}, false},
		{"public ip with host", true, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://8.8.8.8:3000", "LOCAL_DEVELOPMENT_LAN_HOST": "8.8.8.8"}, false},
		{"not local", false, map[string]string{"LOCAL_DEVELOPMENT_LOGIN": "1", "AUTH_URL": "http://127.0.0.1:3000"}, false},
	}
	for _, c := range cases {
		values := validEnv()
		for key, value := range c.set {
			values[key] = value
		}
		config, err := FromEnv(env(values), c.local)
		if err != nil {
			t.Errorf("%s: %v", c.name, err)
			continue
		}
		if config.LocalLogin != c.want {
			t.Errorf("%s: LocalLogin = %v, want %v", c.name, config.LocalLogin, c.want)
		}
	}
}

func TestUnavailable(t *testing.T) {
	response := httptest.NewRecorder()
	Unavailable("authUnavailable").ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/auth/session", nil))
	if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != `{"error":"authUnavailable"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	header := response.Header()
	if header.Get("Content-Type") != "application/json; charset=utf-8" || header.Get("Cache-Control") != "private, no-store" ||
		header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("headers = %v", header)
	}
}

// OnVercel is for server/vercel to set: neither the environment nor the typle-web flag turns it on.
func TestFromEnvLeavesOnVercelOff(t *testing.T) {
	values := validEnv()
	values["VERCEL"] = "1"
	for _, local := range []bool{true, false} {
		if config, err := FromEnv(env(values), local); err != nil || config.OnVercel {
			t.Fatalf("local=%v: OnVercel = %v, %v", local, config.OnVercel, err)
		}
	}
}
