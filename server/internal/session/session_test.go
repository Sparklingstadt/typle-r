package session

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

const testSecret = "typle-e2e-only-not-a-production-secret-32-bytes"

// vector is what the TypeScript sealSession (tests/e2e/sessionCookie.ts) must produce for the same input.
const vector = "eyJzdWIiOiJnaXRodWI6MSIsIm5hbWUiOiJFMkUgVXNlciIsImltYWdlIjoiIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDI1OTIwMDB9.PnYQedkDC_8_wH2YdnWBCStw6T-q-WuuzlkmghaPRro"

// escapedVector is the same contract for a name that JSON may spell in more than one way: & < > are written as they are,
// and U+2028 as \u2028, on both sides.
const escapedVector = "eyJzdWIiOiJnaXRodWI6MiIsIm5hbWUiOiJBICYgQiA8eD5cdTIwMjgiLCJpbWFnZSI6IiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAyNTkyMDAwfQ.kC3xQIvDOm0YGs1xA85LEKb4SB8PCoSntK11CucuLmk"

func testKeys(t *testing.T) Keys {
	t.Helper()
	keys, err := NewKeys(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	return keys
}

func TestNewKeysRefusesEmptySecret(t *testing.T) {
	if _, err := NewKeys(""); err == nil {
		t.Fatal("an empty secret must be refused")
	}
}

func TestSealOpen(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	want := New("github:42", "Ada", "https://example.com/a.png", now)
	got, ok := keys.Open(keys.Seal(want), now)
	if !ok || got != want {
		t.Fatalf("Open = %+v, %v; want %+v", got, ok, want)
	}
	if !want.Expires.Equal(now.Add(MaxAge)) {
		t.Fatalf("Expires = %v, want %v", want.Expires, now.Add(MaxAge))
	}
}

func TestOpenRefuses(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	good := keys.Seal(New("github:42", "Ada", "", now))
	other := keys.Seal(New("github:43", "Eve", "", now))
	// Change a character in the middle of the signature: the last one holds padding bits, which a lax decoder ignores.
	flipped := []byte(good)
	at := strings.Index(good, ".") + 5
	if flipped[at] == 'A' {
		flipped[at] = 'B'
	} else {
		flipped[at] = 'A'
	}
	payload, signature, _ := strings.Cut(good, ".")
	// The last character of a 32-byte signature holds 4 padding bits that must be zero; the character one step up in
	// the alphabet decodes to the same bytes in a lax decoder.
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	nonCanonical := signature[:len(signature)-1] + string(alphabet[strings.IndexByte(alphabet, signature[len(signature)-1])^1])
	cases := map[string]string{
		"padded signature":   good + "=",
		"truncated by one":   good[:len(good)-1],
		"truncated by four":  good[:len(good)-4],
		"non-canonical tail": payload + "." + nonCanonical,
		"extra dot":          good + ".c",
		"signature changed":  string(flipped),
		"payload swapped":    strings.SplitN(other, ".", 2)[0] + "." + strings.SplitN(good, ".", 2)[1],
		"expired":            keys.Seal(Session{Sub: "github:42", Name: "Ada", IssuedAt: now.Add(-2 * time.Hour), Expires: now.Add(-time.Hour)}),
		"expires now":        keys.Seal(Session{Sub: "github:42", Name: "Ada", IssuedAt: now.Add(-time.Hour), Expires: now}),
		"sub not numeric":    keys.Seal(Session{Sub: "github:abc", Name: "Ada", IssuedAt: now, Expires: now.Add(time.Hour)}),
		"sub other prefix":   keys.Seal(Session{Sub: "gitlab:42", Name: "Ada", IssuedAt: now, Expires: now.Add(time.Hour)}),
		"sub with newline":   keys.Seal(Session{Sub: "github:42\n", Name: "Ada", IssuedAt: now, Expires: now.Add(time.Hour)}),
		"no dot":             strings.ReplaceAll(good, ".", ""),
		"empty":              "",
		"only dot":           ".",
	}
	for name, value := range cases {
		if _, ok := keys.Open(value, now); ok {
			t.Errorf("%s: Open accepted %q", name, value)
		}
	}
	otherKeys, err := NewKeys("another-secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := otherKeys.Open(good, now); ok {
		t.Error("a cookie sealed with another secret was accepted")
	}
	if _, ok := keys.Open(good, now); !ok {
		t.Error("the untouched cookie must still open")
	}
}

func TestZeroKeysRefuseEverything(t *testing.T) {
	now := time.Unix(1700000000, 0)
	// What anyone can make without knowing the secret: HMAC with an empty key.
	forge := func(json string) string {
		payload := base64.RawURLEncoding.EncodeToString([]byte(json))
		mac := hmac.New(sha256.New, nil)
		mac.Write([]byte(payload))
		return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	}
	forgedSession := forge(`{"sub":"github:1","name":"x","image":"","iat":1700000000,"exp":1800000000}`)
	forgedOAuth := forge(`{"state":"s","verifier":"v","returnTo":"/","exp":1800000000}`)
	var zero Keys
	for _, value := range []string{forgedSession, forgedOAuth, "", ".", "a.b"} {
		if _, ok := zero.Open(value, now); ok {
			t.Errorf("zero Keys opened %q as a session", value)
		}
		if _, ok := zero.OpenOAuth(value, now); ok {
			t.Errorf("zero Keys opened %q as an OAuth cookie", value)
		}
	}
	for name, seal := range map[string]func(){
		"Seal":      func() { zero.Seal(New("github:1", "x", "", now)) },
		"SealOAuth": func() { zero.SealOAuth(OAuth{Expires: now.Add(time.Hour)}) },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("zero Keys %s did not panic", name)
				}
			}()
			seal()
		}()
	}
}

func TestOAuthKeyIsSeparate(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	o := OAuth{State: "s", Verifier: "v", ReturnTo: "/en/", Expires: now.Add(OAuthMaxAge)}
	value := keys.SealOAuth(o)
	if _, ok := keys.Open(value, now); ok {
		t.Fatal("an OAuth cookie opened as a session")
	}
	if _, ok := keys.OpenOAuth(keys.Seal(New("github:1", "A", "", now)), now); ok {
		t.Fatal("a session cookie opened as an OAuth cookie")
	}
	got, ok := keys.OpenOAuth(value, now)
	if !ok || got != o {
		t.Fatalf("OpenOAuth = %+v, %v; want %+v", got, ok, o)
	}
	if _, ok := keys.OpenOAuth(value, o.Expires); ok {
		t.Fatal("an expired OAuth cookie was accepted")
	}
	if _, ok := keys.OpenOAuth("", now); ok {
		t.Fatal("an empty OAuth cookie was accepted")
	}
}

func TestNeedsRenewal(t *testing.T) {
	issued := time.Unix(1700000000, 0)
	s := New("github:1", "A", "", issued)
	if s.NeedsRenewal(issued.Add(23 * time.Hour)) {
		t.Error("23 hours after issue must not need renewal")
	}
	if !s.NeedsRenewal(issued.Add(24 * time.Hour)) {
		t.Error("24 hours after issue must need renewal")
	}
}

func TestCookieName(t *testing.T) {
	if got := CookieName(true); got != "__Host-typle-session" {
		t.Errorf("CookieName(true) = %q", got)
	}
	if got := CookieName(false); got != "typle-session" {
		t.Errorf("CookieName(false) = %q", got)
	}
}

// Opening the vector is the contract the E2E cookie relies on: what the TypeScript side seals, the server accepts.
func TestOpenVector(t *testing.T) {
	got, ok := testKeys(t).Open(vector, time.Unix(1700000000, 0))
	if !ok || got.Sub != "github:1" || got.Name != "E2E User" || got.Image != "" {
		t.Fatalf("Open(vector) = %+v, %v", got, ok)
	}
}

func TestVector(t *testing.T) {
	keys := testKeys(t)
	s := Session{Sub: "github:1", Name: "E2E User", Image: "", IssuedAt: time.Unix(1700000000, 0), Expires: time.Unix(1702592000, 0)}
	if got := keys.Seal(s); got != vector {
		t.Fatalf("Seal = %q, want %q", got, vector)
	}
}

func TestEscapedVector(t *testing.T) {
	keys := testKeys(t)
	s := Session{Sub: "github:2", Name: "A & B <x>\u2028", Image: "", IssuedAt: time.Unix(1700000000, 0), Expires: time.Unix(1702592000, 0)}
	if got := keys.Seal(s); got != escapedVector {
		t.Fatalf("Seal = %q, want %q", got, escapedVector)
	}
	if got, ok := keys.Open(escapedVector, time.Unix(1700000000, 0)); !ok || got != s {
		t.Fatalf("Open = %+v, %v", got, ok)
	}
}

// A cookie sealed before & < > were written as they are (json.Marshal wrote \u0026 \u003c \u003e) still opens: the
// signature is over the payload as it was received, which is then read as JSON.
func TestOpenHTMLEscapedCookie(t *testing.T) {
	keys := testKeys(t)
	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"github:2","name":"A \u0026 B \u003cx\u003e","image":"","iat":1700000000,"exp":1702592000}`))
	cookie := payload + "." + base64.RawURLEncoding.EncodeToString(sign(keys.session, payload))
	if got, ok := keys.Open(cookie, time.Unix(1700000000, 0)); !ok || got.Name != "A & B <x>" {
		t.Fatalf("Open = %+v, %v", got, ok)
	}
}

// The iPad app's token and code open only as themselves, never as a cookie, and no cookie opens as either.
func TestAppKeysAreSeparate(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	s := New("github:42", "Ada", "https://example.com/a.png", now)
	c := AppCode{Sub: "github:42", Name: "Ada", Challenge: "challenge", Expires: now.Add(AppCodeMaxAge)}
	token, code, cookie := keys.SealApp(s), keys.SealCode(c), keys.Seal(s)
	oauth := keys.SealOAuth(OAuth{State: "s", Verifier: "v", ReturnTo: "/", Expires: now.Add(OAuthMaxAge)})

	if got, ok := keys.OpenApp(token, now); !ok || got != s {
		t.Fatalf("OpenApp = %+v, %v; want %+v", got, ok, s)
	}
	if got, ok := keys.OpenCode(code, now); !ok || got != c {
		t.Fatalf("OpenCode = %+v, %v; want %+v", got, ok, c)
	}
	for _, value := range []string{code, cookie, oauth} {
		if _, ok := keys.OpenApp(value, now); ok {
			t.Errorf("OpenApp opened %q", value)
		}
	}
	for _, value := range []string{token, cookie, oauth} {
		if _, ok := keys.OpenCode(value, now); ok {
			t.Errorf("OpenCode opened %q", value)
		}
	}
	for _, value := range []string{token, code} {
		if _, ok := keys.Open(value, now); ok {
			t.Errorf("Open opened %q as a cookie", value)
		}
		if _, ok := keys.OpenOAuth(value, now); ok {
			t.Errorf("OpenOAuth opened %q", value)
		}
	}
}

func TestOpenCodeRefuses(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	good := AppCode{Sub: "github:42", Challenge: "challenge", Expires: now.Add(AppCodeMaxAge)}
	if _, ok := keys.OpenCode(keys.SealCode(good), good.Expires); ok {
		t.Error("an expired code was accepted")
	}
	noChallenge := good
	noChallenge.Challenge = ""
	if _, ok := keys.OpenCode(keys.SealCode(noChallenge), now); ok {
		t.Error("a code without a challenge was accepted")
	}
	local := good
	local.Sub = "local"
	if _, ok := keys.OpenCode(keys.SealCode(local), now); ok {
		t.Error("a code for no GitHub account was accepted")
	}
	expired := New("github:42", "Ada", "", now.Add(-MaxAge))
	if _, ok := keys.OpenApp(keys.SealApp(expired), now); ok {
		t.Error("an expired token was accepted")
	}
}

// The web app's OAuth cookie has no challenge, and is written as before the iPad app's login existed.
func TestOAuthChallenge(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	web := OAuth{State: "s", Verifier: "v", ReturnTo: "/", Expires: now.Add(OAuthMaxAge)}
	payload, _, _ := strings.Cut(keys.SealOAuth(web), ".")
	data, _ := base64.RawURLEncoding.DecodeString(payload)
	if want := `{"state":"s","verifier":"v","returnTo":"/","exp":1700000600}`; string(data) != want {
		t.Fatalf("web OAuth cookie = %s, want %s", data, want)
	}
	app := web
	app.Challenge = "challenge"
	if got, ok := keys.OpenOAuth(keys.SealOAuth(app), now); !ok || got != app {
		t.Fatalf("OpenOAuth = %+v, %v; want %+v", got, ok, app)
	}
}

// The administrator's cookie opens only as itself, and no other kind opens as it.
func TestAdminKeysAreSeparate(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	a := NewAdmin("admin@example.com", "cabc123", now)
	s := New("ffpf:cabc123", "Ada", "", now)
	admin := keys.SealAdmin(a)
	others := []string{keys.Seal(s), keys.SealApp(s),
		keys.SealOAuth(OAuth{State: "s", Verifier: "v", ReturnTo: "/admin", Admin: true, Provider: "ffpf", Nonce: "n", Expires: now.Add(OAuthMaxAge)}),
		keys.SealCode(AppCode{Sub: "ffpf:cabc123", Challenge: "c", Expires: now.Add(AppCodeMaxAge)})}

	if got, ok := keys.OpenAdmin(admin, now); !ok || got != a {
		t.Fatalf("OpenAdmin = %+v, %v; want %+v", got, ok, a)
	}
	if !a.Expires.Equal(now.Add(AdminMaxAge)) {
		t.Fatalf("Expires = %v, want %v", a.Expires, now.Add(AdminMaxAge))
	}
	for _, value := range others {
		if _, ok := keys.OpenAdmin(value, now); ok {
			t.Errorf("OpenAdmin opened %q", value)
		}
	}
	if _, ok := keys.Open(admin, now); ok {
		t.Error("Open opened the admin cookie")
	}
	if _, ok := keys.OpenApp(admin, now); ok {
		t.Error("OpenApp opened the admin cookie")
	}
	if _, ok := keys.OpenAdmin(admin, a.Expires); ok {
		t.Error("an expired admin cookie was accepted")
	}
	var zero Keys
	if _, ok := zero.OpenAdmin(admin, now); ok {
		t.Error("zero Keys opened the admin cookie")
	}
}

// The administrator's cookie names an FFPF ID account: an email, and a sub as FFPF ID spells it.
func TestOpenAdminRefusesOtherAccounts(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	for name, a := range map[string]Admin{
		"no email":          NewAdmin("", "cabc123", now),
		"no sub":            NewAdmin("admin@example.com", "", now),
		"sub upper case":    NewAdmin("admin@example.com", "Cabc", now),
		"sub too long":      NewAdmin("admin@example.com", strings.Repeat("a", 65), now),
		"sub with a dash":   NewAdmin("admin@example.com", "a-b", now),
		"sub with newline":  NewAdmin("admin@example.com", "abc\n", now),
		"sub with a prefix": NewAdmin("admin@example.com", "ffpf:abc", now),
	} {
		if _, ok := keys.OpenAdmin(keys.SealAdmin(a), now); ok {
			t.Errorf("%s: admin cookie opened", name)
		}
	}
	long := NewAdmin("admin@example.com", strings.Repeat("a", 64), now)
	if got, ok := keys.OpenAdmin(keys.SealAdmin(long), now); !ok || got != long {
		t.Errorf("a 64-character sub must open: %+v, %v", got, ok)
	}
}

// githubAdminVector was sealed by the code from before FFPF ID (key info "typle admin v1") with testSecret, for
// NewAdmin("sparklingstadt", 42, time.Unix(1700000000, 0)). /admin is now reached only through FFPF ID, so an
// administrator's cookie of a GitHub sign-in must not open, even before it expires.
const githubAdminVector = "eyJsb2dpbiI6InNwYXJrbGluZ3N0YWR0IiwiZ2l0aHViSWQiOjQyLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDA0MzIwMH0.f0QswMlBjBK-DevHqVkrPppWjfbqi7G8AYa3_3I6cXQ"

func TestOpenAdminRefusesGitHubAdminCookie(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	if _, ok := keys.OpenAdmin(githubAdminVector, now); ok {
		t.Fatal("an administrator's cookie sealed with the v1 key opened")
	}
	// Nor does the old JSON open under the new key: it has no email or sub.
	old := seal(keys.admin, map[string]any{"login": "sparklingstadt", "githubId": 42, "iat": 1700000000, "exp": 1700043200})
	if _, ok := keys.OpenAdmin(old, now); ok {
		t.Fatal("an administrator's cookie in the GitHub format opened")
	}
}

// A login to /admin keeps its flag through the OAuth cookie.
func TestOAuthAdmin(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	o := OAuth{State: "s", Verifier: "v", ReturnTo: "/admin", Admin: true, Expires: now.Add(OAuthMaxAge)}
	if got, ok := keys.OpenOAuth(keys.SealOAuth(o), now); !ok || got != o {
		t.Fatalf("OpenOAuth = %+v, %v; want %+v", got, ok, o)
	}
}

// githubOAuthVector, githubOAuthChallengeVector, githubAdminOAuthVector and githubAdminOAuthChallengeVector were sealed
// by the code from before FFPF ID, with testSecret and an expiry of 1700000600. A login through GitHub must keep
// producing exactly these bytes: Provider and Nonce are left out of the JSON when empty, so an OAuth cookie in flight
// during a deploy still opens and one sealed now does not differ.
const (
	githubOAuthVector               = "eyJzdGF0ZSI6InN0YXRlLTEiLCJ2ZXJpZmllciI6InZlcmlmaWVyLTEiLCJyZXR1cm5UbyI6Ii9wbGF5P3g9MSZ5PTIiLCJleHAiOjE3MDAwMDA2MDB9.y5nMp3lk65vqMyNXUc39dSZAxmu8WNzgeieOaANmsC8"
	githubOAuthChallengeVector      = "eyJzdGF0ZSI6InN0YXRlLTEiLCJ2ZXJpZmllciI6InZlcmlmaWVyLTEiLCJyZXR1cm5UbyI6Ii9wbGF5IiwiZXhwIjoxNzAwMDAwNjAwLCJjaGFsbGVuZ2UiOiJjaGFsIn0._7F8TYEmhmwIsNwPzJnsVUonAYu94NPottWTamO9hUY"
	githubAdminOAuthVector          = "eyJzdGF0ZSI6InN0YXRlLTEiLCJ2ZXJpZmllciI6InZlcmlmaWVyLTEiLCJyZXR1cm5UbyI6Ii9hZG1pbiIsImV4cCI6MTcwMDAwMDYwMCwiYWRtaW4iOnRydWV9.CxrR0KPjFCBD9iuQaBxuMshksjtvwTc3EtkytWzJDsE"
	githubAdminOAuthChallengeVector = "eyJzdGF0ZSI6InN0YXRlLTEiLCJ2ZXJpZmllciI6InZlcmlmaWVyLTEiLCJyZXR1cm5UbyI6Ii9hZG1pbiIsImV4cCI6MTcwMDAwMDYwMCwiY2hhbGxlbmdlIjoiY2hhbCIsImFkbWluIjp0cnVlfQ.kBmQ8Yj84Dx4M1PKmLanyAbs7RwR7dhvi6E09zNBS1I"
)

func TestGitHubOAuthCookieBytesAreUnchanged(t *testing.T) {
	keys := testKeys(t)
	expires := time.Unix(1700000600, 0)
	for want, o := range map[string]OAuth{
		githubOAuthVector:               {State: "state-1", Verifier: "verifier-1", ReturnTo: "/play?x=1&y=2", Expires: expires},
		githubOAuthChallengeVector:      {State: "state-1", Verifier: "verifier-1", ReturnTo: "/play", Challenge: "chal", Expires: expires},
		githubAdminOAuthVector:          {State: "state-1", Verifier: "verifier-1", ReturnTo: "/admin", Admin: true, Expires: expires},
		githubAdminOAuthChallengeVector: {State: "state-1", Verifier: "verifier-1", ReturnTo: "/admin", Challenge: "chal", Admin: true, Expires: expires},
	} {
		if got := keys.SealOAuth(o); got != want {
			t.Errorf("SealOAuth(%+v) = %q, want %q", o, got, want)
		}
		if got, ok := keys.OpenOAuth(want, expires.Add(-time.Minute)); !ok || got != o {
			t.Errorf("OpenOAuth(%q) = %+v, %v; want %+v", want, got, ok, o)
		}
	}
}

func TestFFPFSessionAndCode(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	want := New("ffpf:cabc123", "ふわ", "", now)
	got, ok := keys.Open(keys.Seal(want), now)
	if !ok || got != want {
		t.Fatalf("session = %+v, %v", got, ok)
	}
	app, ok := keys.OpenApp(keys.SealApp(want), now)
	if !ok || app != want {
		t.Fatalf("app session = %+v, %v", app, ok)
	}
	code := AppCode{Sub: "ffpf:cabc123", Name: "ふわ", Challenge: "c", Expires: now.Add(AppCodeMaxAge)}
	if gotCode, ok := keys.OpenCode(keys.SealCode(code), now); !ok || gotCode != code {
		t.Fatalf("code = %+v, %v", gotCode, ok)
	}
}

func TestOpenRefusesOtherSubjects(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	for _, sub := range []string{"ffpf:", "ffpf:A", "ffpf:" + strings.Repeat("a", 65), "ffpf:a-b", "gitlab:1", "github:", "ffpf:abc\n", "ffpf:github:1"} {
		if _, ok := keys.Open(keys.Seal(New(sub, "x", "", now)), now); ok {
			t.Errorf("session for %q opened", sub)
		}
		if _, ok := keys.OpenApp(keys.SealApp(New(sub, "x", "", now)), now); ok {
			t.Errorf("app session for %q opened", sub)
		}
		if _, ok := keys.OpenCode(keys.SealCode(AppCode{Sub: sub, Challenge: "c", Expires: now.Add(time.Minute)}), now); ok {
			t.Errorf("code for %q opened", sub)
		}
	}
	if _, ok := keys.Open(keys.Seal(New("ffpf:"+strings.Repeat("a", 64), "x", "", now)), now); !ok {
		t.Error("a 64-character subject must open")
	}
}

func TestOAuthProviderAndNonce(t *testing.T) {
	keys := testKeys(t)
	now := time.Unix(1700000000, 0)
	for _, want := range []OAuth{
		{State: "s", Verifier: "v", ReturnTo: "/", Challenge: "c", Provider: "ffpf", Nonce: "n", Expires: now.Add(OAuthMaxAge)},
		{State: "s", Verifier: "v", ReturnTo: "/admin", Admin: true, Provider: "ffpf", Nonce: "n", Expires: now.Add(OAuthMaxAge)},
	} {
		got, ok := keys.OpenOAuth(keys.SealOAuth(want), now)
		if !ok || got != want {
			t.Fatalf("oauth = %+v, %v; want %+v", got, ok, want)
		}
	}
}
