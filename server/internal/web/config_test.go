package web

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

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
	for _, name := range []string{"AUTH_SECRET", "AUTH_URL", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"} {
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
	for _, name := range []string{"AUTH_SECRET", "AUTH_URL", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("err = %v, want %s", err, name)
		}
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
	if header.Get("Content-Type") != "application/json; charset=utf-8" || header.Get("Cache-Control") != "no-store" ||
		header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("headers = %v", header)
	}
}
