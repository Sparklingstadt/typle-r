// Package auth is the server's side of sign-in.
//
// OAuth and GitHub.User are the browser login. OAuth sends the user to GitHub and trades the code that comes back for
// the user's OAuth App token (gho_…), and holds the OAuth App's client secret to do so. GitHub.User then reads who that
// token belongs to once, right after the exchange, and the account is github:<numeric user id>. The token is not kept.
//
// FFPF (ffpf.go) is the other browser login, "Sign in with FFPF ID": an OpenID Connect client of ffpf-portal that
// verifies the ID token itself and gives the account ffpf:<sub>. It shares nothing with the GitHub login but maxBodyLen.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var (
	// ErrInvalidToken is a token GitHub does not accept.
	ErrInvalidToken = errors.New("GitHub does not accept the token")
	// ErrUnavailable is GitHub not answering, or answering in a way that says nothing about the token.
	ErrUnavailable = errors.New("GitHub could not check the token")
)

const maxBodyLen = 1 << 20

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

type GitHub struct {
	// BaseURL is GitHub's REST API, without a trailing slash.
	BaseURL string
	Client  *http.Client
}

func NewGitHub() *GitHub {
	return &GitHub{BaseURL: "https://api.github.com", Client: &http.Client{Timeout: 10 * time.Second}}
}

// User returns the account the token belongs to, for any kind of token: the login flow uses it with the OAuth App
// token it has just been given. Unlike Owner it has no prefix rule, cache or limit on checks.
func (g *GitHub) User(ctx context.Context, token string) (User, error) {
	return g.fetch(ctx, token)
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
