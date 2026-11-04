package auth

import (
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	// ErrFFPFRejected is FFPF ID refusing the login: the token endpoint answered 4xx, or the ID token it gave is not
	// one this app accepts. Trying again with the same code will not help.
	ErrFFPFRejected = errors.New("FFPF ID refused the login")
	// ErrFFPFUnavailable is FFPF ID not answering, answering 5xx, or its JWKS not being had: nothing is known about the
	// login, and it may work later.
	ErrFFPFUnavailable = errors.New("FFPF ID could not be reached")
)

const (
	// The JWKS is trusted this long, so most logins need one call to the portal, not two. A key the portal drops is
	// therefore still accepted for up to this long.
	jwksCacheFor = 10 * time.Minute
	// An ID token is still accepted this long after its exp, for clocks that do not quite agree.
	ffpfLeeway = 60 * time.Second
)

var (
	// jwtSegment is one base64url segment of a compact JWT, without padding.
	jwtSegment = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	// ffpfSub is the form of an FFPF ID subject, which becomes part of the account id ffpf:<sub>.
	ffpfSub = regexp.MustCompile(`^[a-z0-9]{1,64}$`)
	// strictB64 refuses padding and non-zero trailing bits, so a segment has one spelling only.
	strictB64 = base64.RawURLEncoding.Strict()
)

// FFPFUser is an FFPF ID account, as its verified ID token describes it.
type FFPFUser struct{ Sub, Email, Name string }

// Account is the id the app's accounts go by, ffpf:<sub>.
func (u FFPFUser) Account() string {
	return "ffpf:" + u.Sub
}

// FFPF is the "Sign in with FFPF ID" client: the OpenID Connect provider run by ffpf-portal, with the authorization
// code flow and PKCE. Its endpoints are built from Issuer (no discovery), the client secret is sent only to the token
// endpoint with HTTP Basic auth (client_secret_basic), and the ID token that comes back is verified here: an ES256
// signature by a key of the portal's JWKS, and its iss, aud, exp, nonce, email_verified and sub. The access token is
// not used, as the ID token says all the app needs.
type FFPF struct {
	// Issuer is the portal's issuer, without a trailing slash; ID tokens must name it exactly.
	Issuer, ClientID, ClientSecret string
	Client                         *http.Client
	now                            func() time.Time

	// The JWKS, by kid, and when it was fetched. Only P-256 EC keys are kept.
	mu      sync.Mutex
	keys    map[string]*ecdsa.PublicKey
	fetched time.Time
}

func NewFFPF(issuer, clientID, clientSecret string) *FFPF {
	return &FFPF{
		Issuer:       strings.TrimSuffix(issuer, "/"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
		// A redirect is never followed: the token request carries the client secret, and must not be replayed to the
		// target of a 3xx. The 3xx is then an answer that is not 2xx, and an error.
		Client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}},
		now: time.Now,
	}
}

// AuthorizeURL is where to send the browser to sign in. challenge is the S256 code challenge of the verifier later
// given to Exchange, and nonce is the one Exchange will require in the ID token. With login, the portal asks for the
// password even when the browser is still signed in to it (prompt=login).
func (f *FFPF) AuthorizeURL(state, challenge, nonce, redirectURI string, login bool) string {
	query := url.Values{
		"client_id":             {f.ClientID},
		"redirect_uri":          {redirectURI},
		"response_type":         {"code"},
		"scope":                 {"openid email profile"},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
	}
	if login {
		query.Set("prompt", "login")
	}
	return f.Issuer + "/oauth/authorize?" + query.Encode()
}

// Exchange trades the code the portal sent back to the callback for the user's verified ID token, and returns who it
// names. verifier and redirectURI are the ones AuthorizeURL was given (the verifier as its challenge), and nonce the
// one it was given. The error is ErrFFPFRejected or ErrFFPFUnavailable, and never includes the client secret, the
// code, the verifier or a token.
func (f *FFPF) Exchange(ctx context.Context, code, verifier, redirectURI, nonce string) (FFPFUser, error) {
	idToken, err := f.token(ctx, code, verifier, redirectURI)
	if err != nil {
		return FFPFUser{}, err
	}
	return f.verify(ctx, idToken, nonce)
}

// token is the POST to the token endpoint, and returns the ID token of its answer.
func (f *FFPF) token(ctx context.Context, code, verifier, redirectURI string) (string, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"code_verifier": {verifier},
		"redirect_uri":  {redirectURI},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, f.Issuer+"/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("%w: the token request could not be made", ErrFFPFUnavailable)
	}
	// RFC 6749 §2.3.1 has the client id and secret form-encoded before they are put in the Basic credentials.
	request.SetBasicAuth(url.QueryEscape(f.ClientID), url.QueryEscape(f.ClientSecret))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	response, err := f.Client.Do(request)
	if err != nil {
		return "", fmt.Errorf("%w: the token request failed: %v", ErrFFPFUnavailable, urlCause(err))
	}
	defer response.Body.Close()
	switch {
	case response.StatusCode >= 200 && response.StatusCode <= 299:
	case response.StatusCode >= 400 && response.StatusCode <= 499:
		// The portal refused the code or the client (invalid_grant, invalid_client …). Only the RFC 6749 error code is
		// kept, and only if it looks like one, as the rest of the answer is not ours to log.
		var body struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(response.Body, maxBodyLen)).Decode(&body)
		if oauthErrorCode.MatchString(body.Error) {
			return "", fmt.Errorf("%w: the token endpoint answered %d %s", ErrFFPFRejected, response.StatusCode, body.Error)
		}
		return "", fmt.Errorf("%w: the token endpoint answered %d", ErrFFPFRejected, response.StatusCode)
	default:
		return "", fmt.Errorf("%w: the token endpoint answered %d", ErrFFPFUnavailable, response.StatusCode)
	}
	var body struct {
		IDToken *string `json:"id_token"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxBodyLen)).Decode(&body); err != nil {
		return "", fmt.Errorf("%w: the token answer is not JSON with a string id_token", ErrFFPFRejected)
	}
	if body.IDToken == nil || *body.IDToken == "" {
		return "", fmt.Errorf("%w: the token answer has no id_token", ErrFFPFRejected)
	}
	return *body.IDToken, nil
}

var oauthErrorCode = regexp.MustCompile(`^[a-z_]{1,64}$`)

// urlCause is the cause of an *url.Error, without the URL and method it names, to be sure nothing of the request is
// in an error message.
func urlCause(err error) error {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return urlErr.Err
	}
	return err
}

// verify checks the ID token's signature and claims, and returns who it names.
func (f *FFPF) verify(ctx context.Context, idToken, nonce string) (FFPFUser, error) {
	segments, decoded, err := splitJWT(idToken)
	if err != nil {
		return FFPFUser{}, err
	}
	if err := f.checkSignature(ctx, segments, decoded); err != nil {
		return FFPFUser{}, err
	}
	return f.readClaims(decoded[1], nonce)
}

// rejected is an ID token refused for reason.
func rejected(reason string) error {
	return fmt.Errorf("%w: the ID token %s", ErrFFPFRejected, reason)
}

// splitJWT splits a compact JWT into its three segments, and decodes each from strict base64url.
func splitJWT(idToken string) (segments []string, decoded [3][]byte, err error) {
	segments = strings.Split(idToken, ".")
	if len(segments) != 3 {
		return nil, decoded, rejected("is not a compact JWT")
	}
	for i, segment := range segments {
		if !jwtSegment.MatchString(segment) {
			return nil, decoded, rejected("is not a compact JWT")
		}
		data, err := strictB64.DecodeString(segment)
		if err != nil {
			return nil, decoded, rejected("is not a compact JWT")
		}
		decoded[i] = data
	}
	return segments, decoded, nil
}

// checkSignature checks the JWT's header, and its signature with the key of the provider's JWKS that the header names.
func (f *FFPF) checkSignature(ctx context.Context, segments []string, decoded [3][]byte) error {
	var header struct {
		Alg string  `json:"alg"`
		Typ *string `json:"typ"`
		Kid string  `json:"kid"`
	}
	if err := json.Unmarshal(decoded[0], &header); err != nil {
		return rejected("header is not JSON")
	}
	// Only ES256 is accepted, whatever the header claims, so neither "none" nor an HMAC keyed with the public key can
	// get in.
	if header.Alg != "ES256" {
		return rejected("is not ES256")
	}
	if header.Typ != nil && *header.Typ != "JWT" {
		return rejected("is not typed JWT")
	}
	if header.Kid == "" {
		return rejected("has no kid")
	}
	key, err := f.key(ctx, header.Kid)
	if err != nil {
		return err
	}
	// An ES256 signature is r‖s, 32 bytes each (RFC 7518 §3.4), not ASN.1.
	signature := decoded[2]
	if len(signature) != 64 {
		return rejected("signature is not 64 bytes")
	}
	digest := sha256.Sum256([]byte(segments[0] + "." + segments[1]))
	r, s := new(big.Int).SetBytes(signature[:32]), new(big.Int).SetBytes(signature[32:])
	if !ecdsa.Verify(key, digest[:], r, s) {
		return rejected("signature does not verify")
	}
	return nil
}

// readClaims checks the claims of a signed ID token, and returns who they name.
func (f *FFPF) readClaims(payload []byte, nonce string) (FFPFUser, error) {
	var claims struct {
		Iss           string          `json:"iss"`
		Aud           json.RawMessage `json:"aud"`
		Exp           *float64        `json:"exp"`
		Nonce         string          `json:"nonce"`
		Sub           string          `json:"sub"`
		Email         string          `json:"email"`
		EmailVerified json.RawMessage `json:"email_verified"`
		Name          string          `json:"name"`
	}
	reject := func(reason string) (FFPFUser, error) { return FFPFUser{}, rejected(reason) }
	if err := json.Unmarshal(payload, &claims); err != nil {
		return reject("claims are not JSON of the expected types")
	}
	if claims.Iss != f.Issuer {
		return reject("is from another issuer")
	}
	if !audienceHas(claims.Aud, f.ClientID) {
		return reject("is for another client")
	}
	// exp is seconds since 1970; one beyond 2^53 is not a time a portal would mean, and is kept out of the conversion.
	if claims.Exp == nil || *claims.Exp < 0 || *claims.Exp > 1<<53 {
		return reject("has no usable exp")
	}
	expires := time.Unix(int64(*claims.Exp), 0)
	if f.now().After(expires.Add(ffpfLeeway)) {
		return reject("has expired")
	}
	if nonce == "" || claims.Nonce != nonce {
		return reject("has another nonce")
	}
	if string(claims.EmailVerified) != "true" {
		return reject("email is not verified")
	}
	if claims.Email == "" {
		return reject("has no email")
	}
	if !ffpfSub.MatchString(claims.Sub) {
		return reject("sub is not of the expected form")
	}
	name := strings.TrimSpace(claims.Name)
	if name == "" {
		// The portal's name may be empty; the part of the email before "@" is shown instead.
		name, _, _ = strings.Cut(claims.Email, "@")
	}
	return FFPFUser{Sub: claims.Sub, Email: claims.Email, Name: name}, nil
}

// audienceHas reports whether aud, a string or an array of strings (RFC 7519 §4.1.3), names clientID.
func audienceHas(aud json.RawMessage, clientID string) bool {
	var one string
	if err := json.Unmarshal(aud, &one); err == nil {
		return one == clientID
	}
	var many []string
	if err := json.Unmarshal(aud, &many); err == nil {
		for _, a := range many {
			if a == clientID {
				return true
			}
		}
	}
	return false
}

// key returns the portal's public key of kid. The JWKS is fetched when the cache is older than jwksCacheFor, or when
// it does not have kid (the portal may have a new key), but at most once per call, so one ID token can never make
// more than one request to the portal. A kid the fresh JWKS does not have either is ErrFFPFRejected.
func (f *FFPF) key(ctx context.Context, kid string) (*ecdsa.PublicKey, error) {
	f.mu.Lock()
	key, ok := f.keys[kid]
	fresh := !f.fetched.IsZero() && f.now().Sub(f.fetched) < jwksCacheFor
	f.mu.Unlock()
	if ok && fresh {
		return key, nil
	}
	keys, err := f.fetchJWKS(ctx)
	if err != nil {
		return nil, err
	}
	f.mu.Lock()
	f.keys, f.fetched = keys, f.now()
	f.mu.Unlock()
	if key, ok := keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("%w: the ID token's kid is not in the JWKS", ErrFFPFRejected)
}

// fetchJWKS is GET <issuer>/oauth/jwks. Keys that are not P-256 EC signing keys with a kid are left out; anything that
// goes wrong with the request is ErrFFPFUnavailable.
func (f *FFPF) fetchJWKS(ctx context.Context) (map[string]*ecdsa.PublicKey, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, f.Issuer+"/oauth/jwks", nil)
	if err != nil {
		return nil, fmt.Errorf("%w: the JWKS request could not be made", ErrFFPFUnavailable)
	}
	request.Header.Set("Accept", "application/json")
	response, err := f.Client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: the JWKS request failed: %v", ErrFFPFUnavailable, urlCause(err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: the JWKS endpoint answered %d", ErrFFPFUnavailable, response.StatusCode)
	}
	var body struct {
		Keys *[]struct {
			Kty string `json:"kty"`
			Crv string `json:"crv"`
			Use string `json:"use"`
			Kid string `json:"kid"`
			X   string `json:"x"`
			Y   string `json:"y"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxBodyLen)).Decode(&body); err != nil || body.Keys == nil {
		return nil, fmt.Errorf("%w: the JWKS is not JSON with keys", ErrFFPFUnavailable)
	}
	keys := map[string]*ecdsa.PublicKey{}
	for _, k := range *body.Keys {
		if k.Kty != "EC" || k.Crv != "P-256" || k.Kid == "" || (k.Use != "" && k.Use != "sig") {
			continue
		}
		if _, seen := keys[k.Kid]; seen {
			continue
		}
		if key, ok := p256Key(k.X, k.Y); ok {
			keys[k.Kid] = key
		}
	}
	return keys, nil
}

// p256Key makes the public key of a JWK's x and y, if they are 32 bytes each and the point is on P-256. crypto/ecdh
// checks the point, which ecdsa.Verify does not.
func p256Key(x64, y64 string) (*ecdsa.PublicKey, bool) {
	x, errX := strictB64.DecodeString(x64)
	y, errY := strictB64.DecodeString(y64)
	if errX != nil || errY != nil || len(x) != 32 || len(y) != 32 {
		return nil, false
	}
	point := append(append([]byte{0x04}, x...), y...)
	if _, err := ecdh.P256().NewPublicKey(point); err != nil {
		return nil, false
	}
	return &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}, true
}
