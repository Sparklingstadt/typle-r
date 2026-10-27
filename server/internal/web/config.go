package web

import (
	"errors"
	"log"
	"net/netip"
	"net/url"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
)

// FromEnv reads the login settings from the environment: AUTH_SECRET and AUTH_URL (an http or https URL, of which only
// the origin is used), which are required, and AUTH_GITHUB_ID and AUTH_GITHUB_SECRET, and FFPF_ID_ISSUER,
// FFPF_ID_CLIENT_ID and FFPF_ID_CLIENT_SECRET, which are optional. When a
// required one is missing or unusable the error names each of them, so that one message tells everything to fix. When
// either GitHub one is missing OAuth and GitHub are left nil, one warning is logged, and only signin and callback
// answer 503 (authUnavailable): the session, the workspace and the local login do not need GitHub, so development with
// the local login alone needs no OAuth App. FFPF ID is the same: unless all three of its settings are set FFPF is nil,
// and when only some are set one warning is logged, as that is a mistake to fix; when none is set it is not configured,
// and nothing is said. Without it the FFPF ID login and the administrator's dashboard login answer 503. The Store and Report are left to the caller: nothing is opened here, and the
// Keys always come from a successful session.NewKeys, because the zero Keys cannot seal a cookie.
//
// local is for the typle-web command: only then may LocalLogin be turned on. It is on under the conditions of
// localDevelopmentEnabled (src/lib/localDevelopment.ts) except NODE_ENV, which a Go server does not have.
func FromEnv(getenv func(string) string, local bool) (Config, error) {
	var problems []string
	secret, id, clientSecret := getenv("AUTH_SECRET"), getenv("AUTH_GITHUB_ID"), getenv("AUTH_GITHUB_SECRET")
	for _, name := range []string{"AUTH_SECRET", "AUTH_URL"} {
		if getenv(name) == "" {
			problems = append(problems, name+" is not set")
		}
	}
	base, err := parseBaseURL(getenv("AUTH_URL"))
	if err != nil && getenv("AUTH_URL") != "" {
		problems = append(problems, "AUTH_URL is not an http or https URL")
	}
	var keys session.Keys
	if secret != "" {
		if keys, err = session.NewKeys(secret); err != nil {
			problems = append(problems, "AUTH_SECRET is unusable")
		}
	}
	if len(problems) > 0 {
		return Config{}, errors.New("the login settings are incomplete: " + strings.Join(problems, "; "))
	}
	config := Config{Keys: keys, BaseURL: base, LocalLogin: local && localLoginAllowed(getenv, base)}
	if id != "" && clientSecret != "" {
		// Assigned only here: a nil *auth.OAuth in the interface would not be nil.
		config.OAuth, config.GitHub = auth.NewOAuth(id, clientSecret), auth.NewGitHub()
	} else {
		log.Print("AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are not both set: signing in with GitHub is unavailable")
	}
	issuer, ffpfID, ffpfSecret := getenv("FFPF_ID_ISSUER"), getenv("FFPF_ID_CLIENT_ID"), getenv("FFPF_ID_CLIENT_SECRET")
	switch {
	case issuer != "" && ffpfID != "" && ffpfSecret != "":
		// Assigned only here, for the same reason as OAuth.
		config.FFPF = auth.NewFFPF(issuer, ffpfID, ffpfSecret)
	case issuer != "" || ffpfID != "" || ffpfSecret != "":
		log.Print("FFPF_ID_ISSUER, FFPF_ID_CLIENT_ID and FFPF_ID_CLIENT_SECRET are not all set: signing in with FFPF ID is unavailable")
	}
	return config, nil
}

func parseBaseURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return nil, errors.New("not an http or https URL")
	}
	// Only the origin is kept. The Go functions are served at the domain root, so the callbacks are always
	// <origin>/api/auth/callback/github and <origin>/api/auth/callback/ffpf, whatever path AUTH_URL has (Auth.js allowed one, such as https://host/api/auth),
	// and a state-changing request is judged by its origin alone.
	return &url.URL{Scheme: parsed.Scheme, Host: parsed.Host}, nil
}

// localLoginAllowed is localDevelopmentEnabled without the NODE_ENV test: LOCAL_DEVELOPMENT_LOGIN is 1 and AUTH_URL is
// plain http to this machine: a loopback name or address, or a private IPv4 address that LOCAL_DEVELOPMENT_LAN_HOST
// names exactly. AUTH_SECRET is known to be set here.
func localLoginAllowed(getenv func(string) string, base *url.URL) bool {
	if getenv("LOCAL_DEVELOPMENT_LOGIN") != "1" || base.Scheme != "http" {
		return false
	}
	host := strings.ToLower(base.Hostname())
	switch host {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	address, err := netip.ParseAddr(host)
	return err == nil && address.Is4() && address.IsPrivate() && getenv("LOCAL_DEVELOPMENT_LAN_HOST") == host
}
