package session

import (
	"strings"
	"testing"
	"time"
)

const testSecret = "typle-e2e-only-not-a-production-secret-32-bytes"

// vector is what the TypeScript sealSession (tests/e2e/sessionCookie.ts) must produce for the same input.
const vector = "eyJzdWIiOiJnaXRodWI6MSIsIm5hbWUiOiJFMkUgVXNlciIsImltYWdlIjoiIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDI1OTIwMDB9.PnYQedkDC_8_wH2YdnWBCStw6T-q-WuuzlkmghaPRro"

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
	cases := map[string]string{
		"signature changed": string(flipped),
		"payload swapped":   strings.SplitN(other, ".", 2)[0] + "." + strings.SplitN(good, ".", 2)[1],
		"expired":           keys.Seal(Session{Sub: "github:42", Name: "Ada", IssuedAt: now.Add(-2 * time.Hour), Expires: now.Add(-time.Hour)}),
		"expires now":       keys.Seal(Session{Sub: "github:42", Name: "Ada", IssuedAt: now.Add(-time.Hour), Expires: now}),
		"sub not numeric":   keys.Seal(Session{Sub: "github:abc", Name: "Ada", IssuedAt: now, Expires: now.Add(time.Hour)}),
		"sub other prefix":  keys.Seal(Session{Sub: "gitlab:42", Name: "Ada", IssuedAt: now, Expires: now.Add(time.Hour)}),
		"sub with newline":  keys.Seal(Session{Sub: "github:42\n", Name: "Ada", IssuedAt: now, Expires: now.Add(time.Hour)}),
		"no dot":            strings.ReplaceAll(good, ".", ""),
		"empty":             "",
		"only dot":          ".",
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

func TestVector(t *testing.T) {
	keys := testKeys(t)
	s := Session{Sub: "github:1", Name: "E2E User", Image: "", IssuedAt: time.Unix(1700000000, 0), Expires: time.Unix(1702592000, 0)}
	if got := keys.Seal(s); got != vector {
		t.Fatalf("Seal = %q, want %q", got, vector)
	}
}
