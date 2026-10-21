// Package auth is the server's side of GitHub sign-in, in two parts that do not share a policy.
//
// GitHub.Owner tells who an /api/v1 request is from by its bearer token. The token is checked with GitHub's GET /user,
// and the account is github:<numeric user id>, the id the app's GitHub login gives an account (src/auth.ts). It holds
// no secret. Only fine-grained personal access tokens (github_pat_…) are accepted: one is made by its owner for a
// purpose, while the OAuth and app tokens other services hold for a user (gho_, ghu_ …) would otherwise also open the
// user's workspace. Verified tokens are cached and checks with GitHub are rate-limited.
//
// OAuth and GitHub.User are the browser login. OAuth sends the user to GitHub and trades the code that comes back for
// the user's OAuth App token (gho_…), and holds the OAuth App's client secret to do so. GitHub.User then reads who that
// token belongs to once, right after the exchange: it takes any token, with no prefix rule, cache or rate limit, which
// belong to Owner alone. The token is not kept.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	// ErrInvalidToken is a token GitHub does not accept.
	ErrInvalidToken = errors.New("GitHub does not accept the token")
	// ErrUnavailable is GitHub not answering, or answering in a way that says nothing about the token.
	ErrUnavailable = errors.New("GitHub could not check the token")
)

// fineGrainedPrefix starts every fine-grained personal access token.
const fineGrainedPrefix = "github_pat_"

const (
	// A verified token is trusted this long, so most requests need no call to GitHub. A revoked token can therefore
	// still be used for up to this long.
	cacheFor   = 5 * time.Minute
	maxCached  = 1000
	maxBodyLen = 1 << 20
	// Tokens not in the cache are checked with GitHub at most this often, after a burst of maxChecks, so a flood of
	// made-up tokens cannot make the server flood GitHub. Cached tokens are never held back.
	checksPerSecond = 10
	maxChecks       = 20
)

// User is a GitHub account, as GET /user describes it.
type User struct {
	ID        int64
	Login     string
	Name      string
	AvatarURL string
}

// Account is the id the app's accounts go by, github:<numeric user id>.
func (u User) Account() string {
	return fmt.Sprintf("github:%d", u.ID)
}

// DisplayName is the name to show: the profile name if it says anything, else the login.
func (u User) DisplayName() string {
	if strings.TrimSpace(u.Name) != "" {
		return u.Name
	}
	return u.Login
}

type cached struct {
	owner   string
	expires time.Time
}

type GitHub struct {
	// BaseURL is GitHub's REST API, without a trailing slash.
	BaseURL string
	Client  *http.Client
	now     func() time.Time

	mu    sync.Mutex
	cache map[[sha256.Size]byte]cached
	// checks is how many checks can start now; it refills at checksPerSecond since checked.
	checks  float64
	checked time.Time
}

func NewGitHub() *GitHub {
	return &GitHub{BaseURL: "https://api.github.com", Client: &http.Client{Timeout: 10 * time.Second}, now: time.Now}
}

// Owner returns the account the token belongs to.
func (g *GitHub) Owner(ctx context.Context, token string) (string, error) {
	// Another kind of token is refused without asking GitHub.
	if !strings.HasPrefix(token, fineGrainedPrefix) {
		return "", ErrInvalidToken
	}
	// Only a hash of the token is kept in memory.
	key := sha256.Sum256([]byte(token))
	if owner, ok := g.lookup(key); ok {
		return owner, nil
	}
	if !g.allowCheck() {
		return "", fmt.Errorf("%w: too many tokens to check", ErrUnavailable)
	}
	user, err := g.fetch(ctx, token)
	if err != nil {
		return "", err
	}
	owner := user.Account()
	g.store(key, owner)
	return owner, nil
}

// User returns the account the token belongs to, for any kind of token: the login flow uses it with the OAuth App
// token it has just been given. Unlike Owner it has no prefix rule, cache or limit on checks.
func (g *GitHub) User(ctx context.Context, token string) (User, error) {
	return g.fetch(ctx, token)
}

func (g *GitHub) lookup(key [sha256.Size]byte) (string, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	entry, ok := g.cache[key]
	if !ok || !g.now().Before(entry.expires) {
		return "", false
	}
	return entry.owner, true
}

func (g *GitHub) store(key [sha256.Size]byte, owner string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.cache == nil || len(g.cache) >= maxCached {
		g.cache = map[[sha256.Size]byte]cached{}
	}
	g.cache[key] = cached{owner: owner, expires: g.now().Add(cacheFor)}
}

// allowCheck takes one of the checks that may start now, or reports that none is left.
func (g *GitHub) allowCheck() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	if g.checked.IsZero() {
		g.checks = maxChecks
	} else {
		g.checks = min(maxChecks, g.checks+now.Sub(g.checked).Seconds()*checksPerSecond)
	}
	g.checked = now
	if g.checks < 1 {
		return false
	}
	g.checks--
	return true
}

// fetch is GET /user for the token. ErrInvalidToken is GitHub refusing the token; anything else that goes wrong is
// ErrUnavailable.
func (g *GitHub) fetch(ctx context.Context, token string) (User, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, g.BaseURL+"/user", nil)
	if err != nil {
		return User{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := g.Client.Do(request)
	if err != nil {
		return User{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized:
		return User{}, ErrInvalidToken
	default:
		// 403 and 429 are rate limits; 5xx is GitHub's own trouble. None says the token is bad.
		return User{}, fmt.Errorf("%w: GitHub answered %d", ErrUnavailable, response.StatusCode)
	}
	// name and avatar_url may be null, which decodes as empty.
	var body struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxBodyLen)).Decode(&body); err != nil || body.ID <= 0 {
		return User{}, fmt.Errorf("%w: GitHub's answer has no user id", ErrUnavailable)
	}
	return User{ID: body.ID, Login: body.Login, Name: body.Name, AvatarURL: body.AvatarURL}, nil
}

// BearerToken reads `Authorization: Bearer <token>`. The scheme is case-insensitive (RFC 6750); an empty token, or
// one with spaces or control characters, is no token.
func BearerToken(header string) (string, bool) {
	scheme, token, found := strings.Cut(header, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	if token == "" || strings.ContainsFunc(token, func(r rune) bool { return r <= ' ' || r == 0x7f }) {
		return "", false
	}
	return token, true
}
