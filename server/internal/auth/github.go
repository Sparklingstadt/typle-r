// Package auth tells who a request is from by its GitHub token. The token is checked with GitHub's GET /user, and the
// account is github:<numeric user id>, the id the app's GitHub login gives an account (src/auth.ts). The server holds
// no secret: any token GitHub accepts for /user will do, such as a personal access token or `gh auth token`.
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

const (
	// A verified token is trusted this long, so most requests need no call to GitHub. A revoked token can therefore
	// still be used for up to this long.
	cacheFor   = 5 * time.Minute
	maxCached  = 1000
	maxBodyLen = 1 << 20
)

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
}

func NewGitHub() *GitHub {
	return &GitHub{BaseURL: "https://api.github.com", Client: &http.Client{Timeout: 10 * time.Second}, now: time.Now}
}

// Owner returns the account the token belongs to.
func (g *GitHub) Owner(ctx context.Context, token string) (string, error) {
	// Only a hash of the token is kept in memory.
	key := sha256.Sum256([]byte(token))
	if owner, ok := g.lookup(key); ok {
		return owner, nil
	}
	owner, err := g.fetch(ctx, token)
	if err != nil {
		return "", err
	}
	g.store(key, owner)
	return owner, nil
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

func (g *GitHub) fetch(ctx context.Context, token string) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, g.BaseURL+"/user", nil)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := g.Client.Do(request)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized:
		return "", ErrInvalidToken
	default:
		// 403 and 429 are rate limits; 5xx is GitHub's own trouble. None says the token is bad.
		return "", fmt.Errorf("%w: GitHub answered %d", ErrUnavailable, response.StatusCode)
	}
	var user struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxBodyLen)).Decode(&user); err != nil || user.ID <= 0 {
		return "", fmt.Errorf("%w: GitHub's answer has no user id", ErrUnavailable)
	}
	return fmt.Sprintf("github:%d", user.ID), nil
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
