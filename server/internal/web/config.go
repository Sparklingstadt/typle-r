package web

import (
	"errors"
	"net/netip"
	"net/url"
	"strings"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/session"
)

// FromEnv reads the login settings from the environment: AUTH_SECRET, AUTH_URL (an http or https URL),
// AUTH_GITHUB_ID and AUTH_GITHUB_SECRET. When any is missing or unusable the error names each of them, so that one
// message tells everything to fix. The Store and Report are left to the caller: nothing is opened here, and the Keys
// always come from a successful session.NewKeys, because the zero Keys cannot seal a cookie.
//
// local is for the typle-web command: only then may LocalLogin be turned on. It is on under the conditions of
// localDevelopmentEnabled (src/lib/localDevelopment.ts) except NODE_ENV, which a Go server does not have.
func FromEnv(getenv func(string) string, local bool) (Config, error) {
	var problems []string
	secret, id, clientSecret := getenv("AUTH_SECRET"), getenv("AUTH_GITHUB_ID"), getenv("AUTH_GITHUB_SECRET")
	for _, name := range []string{"AUTH_SECRET", "AUTH_URL", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"} {
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
	return Config{
		Keys: keys, BaseURL: base, OAuth: auth.NewOAuth(id, clientSecret), GitHub: auth.NewGitHub(),
		LocalLogin: local && localLoginAllowed(getenv, base),
	}, nil
}

func parseBaseURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return nil, errors.New("not an http or https URL")
	}
	return parsed, nil
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
