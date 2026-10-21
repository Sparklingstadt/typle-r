package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// OAuth is the GitHub OAuth App the login goes through: the authorize URL the browser is sent to, and the exchange of
// the code that comes back for the user's token. The exchange uses PKCE (RFC 7636), and the client secret is sent only
// to TokenURL, never in a URL the browser sees or an error message.
type OAuth struct {
	ClientID, ClientSecret string
	// AuthorizeEndpoint and TokenURL are GitHub's endpoints. (The first is not called AuthorizeURL, as that is the
	// method that builds the whole URL, and Go does not allow a field and a method of one name.)
	AuthorizeEndpoint, TokenURL string
	Client                      *http.Client
}

func NewOAuth(clientID, clientSecret string) *OAuth {
	return &OAuth{
		ClientID:          clientID,
		ClientSecret:      clientSecret,
		AuthorizeEndpoint: "https://github.com/login/oauth/authorize",
		TokenURL:          "https://github.com/login/oauth/access_token",
		Client:            &http.Client{Timeout: 10 * time.Second},
	}
}

// AuthorizeURL is where to send the browser to sign in. challenge is the S256 code challenge of the verifier later
// given to Exchange. No scope is asked for: the app only needs to know who the user is.
func (o *OAuth) AuthorizeURL(state, challenge, redirectURI string) string {
	query := url.Values{
		"client_id":             {o.ClientID},
		"redirect_uri":          {redirectURI},
		"state":                 {state},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
	}
	return o.AuthorizeEndpoint + "?" + query.Encode()
}

// Exchange trades the code GitHub sent back to the callback for the user's access token. verifier is the PKCE code
// verifier whose challenge AuthorizeURL was given, and redirectURI is the one AuthorizeURL was given. Errors never
// include the client secret, the code or the verifier.
func (o *OAuth) Exchange(ctx context.Context, code, verifier, redirectURI string) (string, error) {
	form := url.Values{
		"client_id":     {o.ClientID},
		"client_secret": {o.ClientSecret},
		"code":          {code},
		"code_verifier": {verifier},
		"redirect_uri":  {redirectURI},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, o.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", errors.New("GitHub token request could not be made")
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	response, err := o.Client.Do(request)
	if err != nil {
		// The *url.Error names the URL and the cause, not the form, but only its cause is kept to be sure.
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			err = urlErr.Err
		}
		return "", fmt.Errorf("GitHub token request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return "", fmt.Errorf("GitHub token request answered %d", response.StatusCode)
	}
	// GitHub answers 200 even when it refuses the code, with the reason in error.
	var body struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxBodyLen)).Decode(&body); err != nil {
		return "", errors.New("GitHub token answer is not JSON")
	}
	if body.Error != "" {
		return "", fmt.Errorf("GitHub refused the code: %s", body.Error)
	}
	if body.AccessToken == "" {
		return "", errors.New("GitHub token answer has no access token")
	}
	return body.AccessToken, nil
}
