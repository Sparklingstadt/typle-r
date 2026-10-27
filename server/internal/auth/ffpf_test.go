package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const (
	testClientID     = "typle-r"
	testClientSecret = "the-client-secret"
	testNonce        = "the-nonce"
	testRedirectURI  = "https://app.example/api/auth/callback/ffpf"
)

func newTestKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

func b64(data []byte) string { return base64.RawURLEncoding.EncodeToString(data) }

// signJWT signs header.claims with key as ES256 does, the signature being r‖s of 32 bytes each.
func signJWT(t *testing.T, key *ecdsa.PrivateKey, header, claims map[string]any) string {
	t.Helper()
	h, err := json.Marshal(header)
	if err != nil {
		t.Fatal(err)
	}
	c, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	input := b64(h) + "." + b64(c)
	digest := sha256.Sum256([]byte(input))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	s.FillBytes(signature[32:])
	return input + "." + b64(signature)
}

func signIDToken(t *testing.T, key *ecdsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	return signJWT(t, key, map[string]any{"alg": "ES256", "typ": "JWT", "kid": kid}, claims)
}

func jwk(key *ecdsa.PrivateKey, kid string) map[string]any {
	var x, y [32]byte
	key.X.FillBytes(x[:])
	key.Y.FillBytes(y[:])
	return map[string]any{"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": kid, "x": b64(x[:]), "y": b64(y[:])}
}

// fakePortal is an FFPF ID portal with /oauth/token and /oauth/jwks. The token endpoint answers with idToken; token,
// when set, answers instead.
type fakePortal struct {
	t      *testing.T
	server *httptest.Server
	ffpf   *FFPF

	mu        sync.Mutex
	idToken   string
	token     func(w http.ResponseWriter, r *http.Request)
	jwks      []map[string]any
	jwksFails bool

	jwksCalls  atomic.Int32
	tokenCalls atomic.Int32
}

func newFakePortal(t *testing.T) *fakePortal {
	t.Helper()
	p := &fakePortal{t: t}
	p.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.Lock()
		token, idToken, jwks, jwksFails := p.token, p.idToken, p.jwks, p.jwksFails
		p.mu.Unlock()
		switch r.URL.Path {
		case "/oauth/token":
			p.tokenCalls.Add(1)
			if token != nil {
				token(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "the-access-token", "token_type": "Bearer", "expires_in": 300,
				"id_token": idToken, "scope": "openid email profile",
			})
		case "/oauth/jwks":
			p.jwksCalls.Add(1)
			if jwksFails {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": jwks})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(p.server.Close)
	// The issuer is given with a trailing slash, which NewFFPF removes.
	p.ffpf = NewFFPF(p.server.URL+"/", testClientID, testClientSecret)
	return p
}

func (p *fakePortal) set(f func(p *fakePortal)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	f(p)
}

func (p *fakePortal) claims() map[string]any {
	return map[string]any{
		"iss":            p.server.URL,
		"aud":            testClientID,
		"sub":            "cabc",
		"exp":            time.Now().Add(5 * time.Minute).Unix(),
		"iat":            time.Now().Unix(),
		"nonce":          testNonce,
		"email":          "a@example.com",
		"email_verified": true,
		"name":           "ふわ",
	}
}

func (p *fakePortal) exchange() (FFPFUser, error) {
	return p.ffpf.Exchange(context.Background(), "the-code", "the-verifier", testRedirectURI, testNonce)
}

func TestFFPFAuthorizeURL(t *testing.T) {
	f := NewFFPF("https://portal.example/", "client-id", "client-secret")
	raw := f.AuthorizeURL("the state", "the challenge", "the nonce", testRedirectURI)
	if !strings.HasPrefix(raw, "https://portal.example/oauth/authorize?") {
		t.Fatalf("url = %s", raw)
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"client_id":             "client-id",
		"redirect_uri":          testRedirectURI,
		"response_type":         "code",
		"scope":                 "openid email profile",
		"state":                 "the state",
		"nonce":                 "the nonce",
		"code_challenge":        "the challenge",
		"code_challenge_method": "S256",
	}
	query := u.Query()
	for key, value := range want {
		if got := query.Get(key); got != value {
			t.Errorf("%s = %q, want %q", key, got, value)
		}
	}
	if len(query) != len(want) {
		t.Errorf("query = %v, want only %d values", query, len(want))
	}
	if strings.Contains(raw, "client-secret") {
		t.Error("the authorize URL has the client secret")
	}
}

func TestFFPFExchangeSuccess(t *testing.T) {
	p := newFakePortal(t)
	key := newTestKey(t)
	p.set(func(p *fakePortal) {
		p.jwks = []map[string]any{jwk(key, "k1")}
		p.idToken = signIDToken(t, key, "k1", p.claims())
		p.token = func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost || r.Header.Get("Accept") != "application/json" ||
				!strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
				t.Errorf("unexpected request %s %v", r.Method, r.Header)
			}
			id, secret, ok := r.BasicAuth()
			if !ok || id != testClientID || secret != testClientSecret {
				t.Errorf("basic auth = %q, %q, %v", id, secret, ok)
			}
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			want := url.Values{
				"grant_type":    {"authorization_code"},
				"code":          {"the-code"},
				"code_verifier": {"the-verifier"},
				"redirect_uri":  {testRedirectURI},
			}
			if len(r.PostForm) != len(want) {
				t.Errorf("form = %v", r.PostForm)
			}
			for k := range want {
				if r.PostForm.Get(k) != want.Get(k) {
					t.Errorf("%s = %q, want %q", k, r.PostForm.Get(k), want.Get(k))
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id_token": p.idToken, "token_type": "Bearer"})
		}
	})
	user, err := p.exchange()
	if err != nil {
		t.Fatal(err)
	}
	if user != (FFPFUser{Sub: "cabc", Email: "a@example.com", Name: "ふわ"}) {
		t.Fatalf("user = %+v", user)
	}
	if user.Account() != "ffpf:cabc" {
		t.Fatalf("account = %q", user.Account())
	}
	if p.tokenCalls.Load() != 1 || p.jwksCalls.Load() != 1 {
		t.Fatalf("token calls = %d, jwks calls = %d", p.tokenCalls.Load(), p.jwksCalls.Load())
	}
}

// Accepted variations of a valid ID token.
func TestFFPFExchangeAccepts(t *testing.T) {
	for name, tc := range map[string]struct {
		change func(c map[string]any)
		want   FFPFUser
	}{
		"exp 59 seconds ago": {
			change: func(c map[string]any) { c["exp"] = time.Now().Add(-59 * time.Second).Unix() },
			want:   FFPFUser{Sub: "cabc", Email: "a@example.com", Name: "ふわ"},
		},
		"aud as an array": {
			change: func(c map[string]any) { c["aud"] = []string{"other", testClientID} },
			want:   FFPFUser{Sub: "cabc", Email: "a@example.com", Name: "ふわ"},
		},
		"no name": {
			change: func(c map[string]any) { delete(c, "name") },
			want:   FFPFUser{Sub: "cabc", Email: "a@example.com", Name: "a"},
		},
		"blank name": {
			change: func(c map[string]any) { c["name"] = "  " },
			want:   FFPFUser{Sub: "cabc", Email: "a@example.com", Name: "a"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			p := newFakePortal(t)
			key := newTestKey(t)
			claims := p.claims()
			tc.change(claims)
			p.set(func(p *fakePortal) {
				p.jwks = []map[string]any{jwk(key, "k1")}
				p.idToken = signIDToken(t, key, "k1", claims)
			})
			user, err := p.exchange()
			if err != nil || user != tc.want {
				t.Fatalf("user = %+v, err = %v", user, err)
			}
		})
	}
}

func TestFFPFExchangeRejects(t *testing.T) {
	other := newTestKey(t)
	for name, makeToken := range map[string]func(p *fakePortal, key *ecdsa.PrivateKey) string{
		"other iss": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["iss"] = p.server.URL + "/other"
			return signIDToken(t, key, "k1", c)
		},
		"iss with a trailing slash": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["iss"] = p.server.URL + "/"
			return signIDToken(t, key, "k1", c)
		},
		"other aud": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["aud"] = "other"
			return signIDToken(t, key, "k1", c)
		},
		"aud array without the client": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["aud"] = []string{"other"}
			return signIDToken(t, key, "k1", c)
		},
		"exp 61 seconds ago": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["exp"] = time.Now().Add(-61 * time.Second).Unix()
			return signIDToken(t, key, "k1", c)
		},
		"no exp": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			delete(c, "exp")
			return signIDToken(t, key, "k1", c)
		},
		"exp as a string": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["exp"] = "9999999999"
			return signIDToken(t, key, "k1", c)
		},
		"other nonce": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["nonce"] = "other"
			return signIDToken(t, key, "k1", c)
		},
		"no nonce": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			delete(c, "nonce")
			return signIDToken(t, key, "k1", c)
		},
		"email_verified false": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["email_verified"] = false
			return signIDToken(t, key, "k1", c)
		},
		"email_verified as a string": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["email_verified"] = "true"
			return signIDToken(t, key, "k1", c)
		},
		"no email": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			delete(c, "email")
			return signIDToken(t, key, "k1", c)
		},
		"signed with another key": func(p *fakePortal, _ *ecdsa.PrivateKey) string {
			return signIDToken(t, other, "k1", p.claims())
		},
		"alg none": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			token := signJWT(t, key, map[string]any{"alg": "none", "kid": "k1"}, p.claims())
			return token[:strings.LastIndex(token, ".")+1]
		},
		"alg none with a signature": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			return signJWT(t, key, map[string]any{"alg": "none", "kid": "k1"}, p.claims())
		},
		"alg HS256": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			return signJWT(t, key, map[string]any{"alg": "HS256", "kid": "k1"}, p.claims())
		},
		"typ other": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			return signJWT(t, key, map[string]any{"alg": "ES256", "typ": "at+jwt", "kid": "k1"}, p.claims())
		},
		"no kid": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			return signJWT(t, key, map[string]any{"alg": "ES256", "typ": "JWT"}, p.claims())
		},
		"sub A/B": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["sub"] = "A/B"
			return signIDToken(t, key, "k1", c)
		},
		"sub too long": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			c["sub"] = strings.Repeat("a", 65)
			return signIDToken(t, key, "k1", c)
		},
		"no sub": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			c := p.claims()
			delete(c, "sub")
			return signIDToken(t, key, "k1", c)
		},
		"four segments": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			return signIDToken(t, key, "k1", p.claims()) + ".x"
		},
		"padded signature": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			return signIDToken(t, key, "k1", p.claims()) + "="
		},
		"short signature": func(p *fakePortal, key *ecdsa.PrivateKey) string {
			token := signIDToken(t, key, "k1", p.claims())
			return token[:strings.LastIndex(token, ".")+1] + b64(make([]byte, 63))
		},
		"not a JWT": func(*fakePortal, *ecdsa.PrivateKey) string { return "not a jwt" },
		"empty":     func(*fakePortal, *ecdsa.PrivateKey) string { return "" },
	} {
		t.Run(name, func(t *testing.T) {
			p := newFakePortal(t)
			key := newTestKey(t)
			p.set(func(p *fakePortal) {
				p.jwks = []map[string]any{jwk(key, "k1")}
				p.idToken = makeToken(p, key)
			})
			user, err := p.exchange()
			if !errors.Is(err, ErrFFPFRejected) || user != (FFPFUser{}) {
				t.Fatalf("user = %+v, err = %v, want ErrFFPFRejected", user, err)
			}
		})
	}
	for name, answer := range map[string]func(w http.ResponseWriter, r *http.Request){
		"token 400": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
		},
		"token 401": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid_client"}`))
		},
		"no id_token": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"access_token":"a","token_type":"Bearer"}`))
		},
		"id_token not a string": func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"id_token":1}`)) },
		"not JSON":              func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html>`)) },
	} {
		t.Run(name, func(t *testing.T) {
			p := newFakePortal(t)
			p.set(func(p *fakePortal) { p.token = answer })
			user, err := p.exchange()
			if !errors.Is(err, ErrFFPFRejected) || user != (FFPFUser{}) {
				t.Fatalf("user = %+v, err = %v, want ErrFFPFRejected", user, err)
			}
		})
	}
}

func TestFFPFExchangeUnavailable(t *testing.T) {
	for name, setup := range map[string]func(p *fakePortal, key *ecdsa.PrivateKey){
		"token 502": func(p *fakePortal, _ *ecdsa.PrivateKey) {
			p.token = func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadGateway) }
		},
		"token 3xx": func(p *fakePortal, _ *ecdsa.PrivateKey) {
			p.token = func(w http.ResponseWriter, r *http.Request) {
				http.Redirect(w, r, p.server.URL+"/elsewhere", http.StatusTemporaryRedirect)
			}
		},
		"jwks 500": func(p *fakePortal, _ *ecdsa.PrivateKey) { p.jwksFails = true },
	} {
		t.Run(name, func(t *testing.T) {
			p := newFakePortal(t)
			key := newTestKey(t)
			p.set(func(p *fakePortal) {
				p.jwks = []map[string]any{jwk(key, "k1")}
				p.idToken = signIDToken(t, key, "k1", p.claims())
				setup(p, key)
			})
			user, err := p.exchange()
			if !errors.Is(err, ErrFFPFUnavailable) || user != (FFPFUser{}) {
				t.Fatalf("user = %+v, err = %v, want ErrFFPFUnavailable", user, err)
			}
			assertNoSecrets(t, err)
		})
	}
	t.Run("server down", func(t *testing.T) {
		p := newFakePortal(t)
		p.server.Close()
		user, err := p.exchange()
		if !errors.Is(err, ErrFFPFUnavailable) || user != (FFPFUser{}) {
			t.Fatalf("user = %+v, err = %v, want ErrFFPFUnavailable", user, err)
		}
		assertNoSecrets(t, err)
	})
}

func assertNoSecrets(t *testing.T, err error) {
	t.Helper()
	for _, secret := range []string{testClientSecret, "the-code", "the-verifier"} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("error %q has %q", err, secret)
		}
	}
}

func TestFFPFRefetchesJWKSForUnknownKid(t *testing.T) {
	p := newFakePortal(t)
	first, second, unknown := newTestKey(t), newTestKey(t), newTestKey(t)
	p.set(func(p *fakePortal) {
		p.jwks = []map[string]any{jwk(first, "k1")}
		p.idToken = signIDToken(t, first, "k1", p.claims())
	})
	if _, err := p.exchange(); err != nil {
		t.Fatal(err)
	}
	// The portal's key changes; the cached JWKS is still fresh, but does not have the new kid.
	p.set(func(p *fakePortal) {
		p.jwks = []map[string]any{jwk(second, "k2")}
		p.idToken = signIDToken(t, second, "k2", p.claims())
	})
	if user, err := p.exchange(); err != nil || user.Sub != "cabc" {
		t.Fatalf("user = %+v, err = %v", user, err)
	}
	if got := p.jwksCalls.Load(); got != 2 {
		t.Fatalf("jwks calls = %d, want 2", got)
	}
	// A kid the portal does not have is fetched for once more, and then refused.
	p.set(func(p *fakePortal) { p.idToken = signIDToken(t, unknown, "k3", p.claims()) })
	if _, err := p.exchange(); !errors.Is(err, ErrFFPFRejected) {
		t.Fatalf("err = %v, want ErrFFPFRejected", err)
	}
	if got := p.jwksCalls.Load(); got != 3 {
		t.Fatalf("jwks calls = %d, want 3", got)
	}
}

// The JWKS is cached for 10 minutes and fetched again after.
func TestFFPFCachesJWKS(t *testing.T) {
	p := newFakePortal(t)
	key := newTestKey(t)
	now := time.Now()
	p.ffpf.now = func() time.Time { return now }
	p.set(func(p *fakePortal) {
		p.jwks = []map[string]any{jwk(key, "k1")}
		p.idToken = signIDToken(t, key, "k1", p.claims())
	})
	for range 3 {
		if _, err := p.exchange(); err != nil {
			t.Fatal(err)
		}
	}
	if got := p.jwksCalls.Load(); got != 1 {
		t.Fatalf("jwks calls = %d, want 1", got)
	}
	now = now.Add(10*time.Minute + time.Second)
	p.set(func(p *fakePortal) {
		c := p.claims()
		c["exp"] = now.Add(5 * time.Minute).Unix()
		p.idToken = signIDToken(t, key, "k1", c)
	})
	if _, err := p.exchange(); err != nil {
		t.Fatal(err)
	}
	if got := p.jwksCalls.Load(); got != 2 {
		t.Fatalf("jwks calls = %d, want 2", got)
	}
}

// Keys that are not P-256 EC keys, or whose point is not on the curve, are ignored.
func TestFFPFIgnoresUnusableJWKs(t *testing.T) {
	p := newFakePortal(t)
	key := newTestKey(t)
	offCurve := jwk(key, "k1")
	offCurve["y"] = b64(make([]byte, 32))
	p.set(func(p *fakePortal) {
		p.jwks = []map[string]any{
			{"kty": "RSA", "kid": "k1", "n": "AQAB", "e": "AQAB"},
			{"kty": "EC", "crv": "P-384", "kid": "k1", "x": b64(make([]byte, 48)), "y": b64(make([]byte, 48))},
			offCurve,
		}
		p.idToken = signIDToken(t, key, "k1", p.claims())
	})
	if _, err := p.exchange(); !errors.Is(err, ErrFFPFRejected) {
		t.Fatalf("err = %v, want ErrFFPFRejected", err)
	}
	p.set(func(p *fakePortal) { p.jwks = append(p.jwks, jwk(key, "k1")) })
	if _, err := p.exchange(); err != nil {
		t.Fatal(err)
	}
}
