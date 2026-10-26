package web

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

const testBase = "http://localhost:3000"

var testOwner = "github:4242"

// fakeWorkspaces stands in for the database where a test is about the handler: what reaches the store and how the
// handler answers what comes back.
type fakeWorkspaces struct {
	fakeStore
	saved    *store.Saved
	reads    int
	writes   int
	revision int
	change   store.Change
}

func (f *fakeWorkspaces) ReadRevision(context.Context, string) (*store.Saved, error) {
	f.reads++
	return f.saved, f.err
}

func (f *fakeWorkspaces) WriteRevision(_ context.Context, _ string, revision int, change store.Change) (*store.Saved, error) {
	f.writes++
	f.revision, f.change = revision, change
	if f.err != nil {
		return nil, f.err
	}
	// As the store does: lists sent without packs keep their labels, and no packs are saved.
	encode, packs := workspace.EncodeWithLabels, []byte(nil)
	if change.HasPacks {
		encode = workspace.Encode
		var err error
		if packs, err = workspace.EncodePacks(change.Packs); err != nil {
			return nil, err
		}
	}
	lists, err := encode(change.Lists)
	if err != nil {
		return nil, err
	}
	devices, err := workspace.EncodeDevices(change.Devices)
	if err != nil {
		return nil, err
	}
	return &store.Saved{Lists: lists, Packs: packs, Devices: devices, Revision: revision + 1}, nil
}

// The database tests need the app's tables (npm run db:migrate). They use a random account and delete its row.
func realStore(t *testing.T) (*store.Store, string) {
	t.Helper()
	connection := os.Getenv("TYPLE_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set TYPLE_TEST_DATABASE_URL to a migrated test database")
	}
	ctx := context.Background()
	s, err := store.OpenApp(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	conn, err := pgx.Connect(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	random := make([]byte, 8)
	_, _ = rand.Read(random)
	owner := fmt.Sprintf("github:%d", binary.BigEndian.Uint64(random)>>1)
	t.Cleanup(func() {
		_, _ = conn.Exec(ctx, `DELETE FROM typle_workspaces WHERE owner_id = $1`, owner)
		conn.Close(ctx)
	})
	return s, owner
}

type harness struct {
	handler http.Handler
	keys    session.Keys
	reports []string
}

func newHarness(t *testing.T, s Store, base string) *harness {
	t.Helper()
	keys, err := session.NewKeys("test secret")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	h := &harness{keys: keys}
	h.handler = New(Config{Store: s, Keys: keys, BaseURL: parsed, Report: func(r *http.Request, err error, operation string) {
		h.reports = append(h.reports, operation)
	}})
	return h
}

func (h *harness) cookie(sub string, secure bool) *http.Cookie {
	return &http.Cookie{Name: session.CookieName(secure), Value: h.keys.Seal(session.New(sub, "", "", time.Now()))}
}

// request is a signed-in PUT from the app's own origin unless the test changes it.
func (h *harness) request(method, body string, owner string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	r := httptest.NewRequest(method, "/api/workspace", reader)
	if method == http.MethodPut {
		r.Header.Set("Origin", testBase)
		r.Header.Set("Content-Type", "application/json")
	}
	if owner != "" {
		r.AddCookie(h.cookie(owner, false))
	}
	for _, f := range change {
		f(r)
	}
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	return response
}

func (h *harness) get(owner string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	return h.request(http.MethodGet, "", owner, change...)
}

func (h *harness) put(owner, body string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	return h.request(http.MethodPut, body, owner, change...)
}

// payload is a request body of the account's, with the fields the test is about.
func payload(owner, fields string) string {
	return `{"accountId":"` + owner + `",` + fields + `}`
}

func expectError(t *testing.T, response *httptest.ResponseRecorder, status int, key string) {
	t.Helper()
	if response.Code != status || strings.TrimSpace(response.Body.String()) != `{"error":"`+key+`"}` {
		t.Fatalf("response = %d %s; want %d %s", response.Code, response.Body, status, key)
	}
	expectPrivate(t, response)
}

func expectPrivate(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	if response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("Vary") != "Cookie" {
		t.Fatalf("headers = %v", response.Header())
	}
}

func decodeBody(t *testing.T, response *httptest.ResponseRecorder) map[string]json.RawMessage {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &fields); err != nil {
		t.Fatalf("body %q: %v", response.Body, err)
	}
	return fields
}

const oneList = `{"id":"one","name":"One","createdAt":"2026-09-06","words":[{"display":"a","input":"a","annotation":""}],"records":[]}`

// aList is a list that passes validateList, with this id and name.
func aList(id, name string) string {
	return `{"id":"` + id + `","name":"` + name + `","createdAt":"2026-09-06","words":[{"display":"a","input":"a","annotation":""}],"records":[]}`
}

func TestGetLoginRequired(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{}, testBase)
	tampered := h.cookie(testOwner, false)
	// The last character is made a different one whatever it was, since the signature differs every run.
	last := "A"
	if strings.HasSuffix(tampered.Value, "A") {
		last = "B"
	}
	tampered.Value = tampered.Value[:len(tampered.Value)-1] + last
	other, err := session.NewKeys("another secret")
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*http.Request){
		"no cookie":      func(*http.Request) {},
		"auth.js cookie": func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "authjs.session-token", Value: "x"}) },
		"tampered":       func(r *http.Request) { r.AddCookie(tampered) },
		"other secret": func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: "typle-session", Value: other.Seal(session.New(testOwner, "", "", time.Now()))})
		},
		"__Host- over http":  func(r *http.Request) { r.AddCookie(h.cookie(testOwner, true)) },
		"not a GitHub login": func(r *http.Request) { r.AddCookie(h.cookie("google:1", false)) },
	}
	for name, add := range cases {
		t.Run(name, func(t *testing.T) { expectError(t, h.get("", add), http.StatusUnauthorized, "loginRequired") })
	}
}

func TestSecureCookieName(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, "https://typle.example")
	r := httptest.NewRequest(http.MethodGet, "/api/workspace", nil)
	r.AddCookie(h.cookie(testOwner, false))
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	expectError(t, response, http.StatusUnauthorized, "loginRequired")
	r = httptest.NewRequest(http.MethodGet, "/api/workspace", nil)
	r.AddCookie(h.cookie(testOwner, true))
	response = httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	if response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

func TestMethod(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{}, testBase)
	for _, method := range []string{http.MethodPost, http.MethodDelete, http.MethodPatch} {
		response := h.request(method, "", testOwner)
		if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD, PUT" {
			t.Fatalf("%s: response = %d %v", method, response.Code, response.Header())
		}
	}
}

func TestGetEmpty(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	response := h.get(owner)
	want := `{"lists":[],"packs":null,"devices":[],"revision":0,"accountId":"` + owner + `"}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want {
		t.Fatalf("response = %d %s; want %s", response.Code, response.Body, want)
	}
	expectPrivate(t, response)
}

func TestPutForbidden(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	body := payload(testOwner, `"revision":0,"lists":[]`)
	cases := map[string]func(*http.Request){
		"other origin": func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") },
		"no origin":    func(r *http.Request) { r.Header.Del("Origin") },
		"origin path":  func(r *http.Request) { r.Header.Set("Origin", testBase+"/") },
		"other port":   func(r *http.Request) { r.Header.Set("Origin", "http://localhost:3001") },
		"text/plain":   func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") },
		"no content":   func(r *http.Request) { r.Header.Del("Content-Type") },
		"other case":   func(r *http.Request) { r.Header.Set("Content-Type", "Application/JSON") },
		"json suffix":  func(r *http.Request) { r.Header.Set("Content-Type", "application/jsonp") },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put(testOwner, body, change), http.StatusForbidden, "forbiddenRequest")
		})
	}
	// The origin and type are checked before the login, so a forbidden request is not told to sign in.
	expectError(t, h.put("", body, cases["other origin"]), http.StatusForbidden, "forbiddenRequest")
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
	for _, contentType := range []string{"application/json; charset=utf-8", "application/json;charset=utf-8", "application/json ; x=y"} {
		response := h.put(testOwner, body, func(r *http.Request) { r.Header.Set("Content-Type", contentType) })
		if response.Code != http.StatusOK {
			t.Fatalf("%s: response = %d %s", contentType, response.Code, response.Body)
		}
	}
}

// The origin is compared as a browser writes it, so a default port in the configured URL does not matter.
func TestSameOriginNormalizes(t *testing.T) {
	for base, origin := range map[string]string{
		"https://Typle.Example":      "https://typle.example",
		"https://typle.example:443/": "https://typle.example",
		"http://localhost:80":        "http://localhost",
		"http://localhost:3000/path": "http://localhost:3000",
	} {
		parsed, _ := url.Parse(base)
		s := &server{config: Config{BaseURL: parsed}}
		r := httptest.NewRequest(http.MethodPut, "/api/workspace", nil)
		r.Header.Set("Origin", origin)
		if !s.sameOrigin(r) {
			t.Errorf("%s: origin %s refused", base, origin)
		}
		r.Header.Set("Origin", "https://other.example")
		if s.sameOrigin(r) {
			t.Errorf("%s: other origin accepted", base)
		}
	}
	// Without a configured URL nothing is the app's own origin.
	r := httptest.NewRequest(http.MethodPut, "/api/workspace", nil)
	r.Header.Set("Origin", testBase)
	if (&server{}).sameOrigin(r) {
		t.Error("origin accepted without a base URL")
	}
}

func TestPutLoginRequired(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	expectError(t, h.put("", payload(testOwner, `"revision":0`)), http.StatusUnauthorized, "loginRequired")
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
}

func TestPutTooLarge(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	prefix, suffix := `{"accountId":"`+testOwner+`","revision":0,"lists":[`, `]}`
	sized := func(n int) string { return prefix + strings.Repeat(" ", n-len(prefix)-len(suffix)) + suffix }
	if response := h.put(testOwner, sized(1<<20)); response.Code != http.StatusOK {
		t.Fatalf("1 MiB: response = %d %s", response.Code, response.Body)
	}
	expectError(t, h.put(testOwner, sized(1<<20+1)), http.StatusRequestEntityTooLarge, "workspaceTooLarge")
	// The answer does not wait for the rest of a body that is far too big.
	read := &countingReader{}
	r := httptest.NewRequest(http.MethodPut, "/api/workspace", read)
	r.Header.Set("Origin", testBase)
	r.Header.Set("Content-Type", "application/json")
	r.AddCookie(h.cookie(testOwner, false))
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	expectError(t, response, http.StatusRequestEntityTooLarge, "workspaceTooLarge")
	if read.n > 1<<20+64<<10 {
		t.Fatalf("read %d bytes of an endless body", read.n)
	}
}

type countingReader struct{ n int }

func (c *countingReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = ' '
	}
	c.n += len(p)
	return len(p), nil
}

// The login is checked before the size, and the size before the content.
func TestPutCheckOrder(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	big := payload(testOwner, `"revision":0,"lists":[`) + strings.Repeat(" ", 1<<20) + `]}`
	expectError(t, h.put("", big), http.StatusUnauthorized, "loginRequired")
	expectError(t, h.put(testOwner, "x"+strings.Repeat(" ", 1<<20)), http.StatusRequestEntityTooLarge, "workspaceTooLarge")
	expectError(t, h.put(testOwner, strings.Replace(big, testOwner, "github:7", 1)), http.StatusRequestEntityTooLarge, "workspaceTooLarge")
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
}

func TestPutEmpty(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{}, testBase)
	expectError(t, h.put(testOwner, ""), http.StatusBadRequest, "emptyRequest")
}

func TestPutAccountChanged(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	for name, body := range map[string]string{
		"other account": payload("github:7", `"revision":0,"lists":[]`),
		"no account":    `{"revision":0,"lists":[]}`,
		"null account":  `{"accountId":null,"revision":0}`,
		"number":        `{"accountId":4242,"revision":0}`,
		// The account is checked before the rest of the request, as the route does.
		"invalid rest": payload("github:7", `"revision":-1,"lists":null`),
		"legacy":       payload("github:7", `"revision":0,"profileId":"zh"`),
	} {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put(testOwner, body), http.StatusUnauthorized, "loginAccountChanged")
		})
	}
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
}

func TestPutInvalid(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	bodies := map[string]string{
		"negative":        payload(testOwner, `"revision":-1,"lists":[]`),
		"fraction":        payload(testOwner, `"revision":1.5,"lists":[]`),
		"string":          payload(testOwner, `"revision":"0","lists":[]`),
		"missing":         payload(testOwner, `"lists":[]`),
		"null":            payload(testOwner, `"revision":null,"lists":[]`),
		"true":            payload(testOwner, `"revision":true,"lists":[]`),
		"overflow":        payload(testOwner, `"revision":1e400,"lists":[]`),
		"not safe":        payload(testOwner, `"revision":9007199254740992,"lists":[]`),
		"null lists":      payload(testOwner, `"revision":0,"lists":null`),
		"null devices":    payload(testOwner, `"revision":0,"devices":null`),
		"lists object":    payload(testOwner, `"revision":0,"lists":{}`),
		"unreadable list": payload(testOwner, `"revision":0,"lists":[{"id":""}]`),
		"bad device":      payload(testOwner, `"revision":0,"devices":[{"id":"default","name":"x","layout":""}]`),
		"array":           `[]`,
		"number":          `5`,
		"null body":       `null`,
		"not JSON":        `lists`,
		"truncated":       `{"accountId":"` + testOwner + `",`,
		"two objects":     payload(testOwner, `"revision":0`) + payload(testOwner, `"revision":0`),
		"trailing":        payload(testOwner, `"revision":0`) + ` x`,
		// The revision is checked before the legacy profile, and the legacy profile before the lists.
		"revision first": payload(testOwner, `"revision":-1,"profileId":"zh"`),
	}
	for name, body := range bodies {
		t.Run(name, func(t *testing.T) { expectError(t, h.put(testOwner, body), http.StatusBadRequest, "invalidWorkspace") })
	}
	if fake.writes != 0 || fake.reads != 0 {
		t.Fatalf("the store was reached: %d writes, %d reads", fake.writes, fake.reads)
	}
}

func TestPutLegacy(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	for name, fields := range map[string]string{
		"other profile": `"revision":1,"profileId":"p2","lists":[]`,
		"profiles":      `"revision":1,"profiles":[]`,
		"null profiles": `"revision":1,"profiles":null`,
		"null profile":  `"revision":1,"profileId":null`,
		"number":        `"revision":1,"profileId":1`,
		"with default":  `"revision":1,"profileId":"default","profiles":[{"id":"default","name":"メイン"}]`,
		"before lists":  `"revision":1,"profileId":"p2","lists":null`,
	} {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put(testOwner, payload(testOwner, fields)), http.StatusConflict, "conflict")
		})
	}
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
	response := h.put(testOwner, payload(testOwner, `"revision":1,"profileId":"default","lists":[`+oneList+`]`))
	if response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

func TestPutAnswersAndPassesOn(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	device := `{"id":"mac","name":"MacBook","layout":"JIS"}`
	response := h.put(testOwner, payload(testOwner, `"revision":3,"lists":[`+strings.Replace(oneList, `"records":[]`, `"records":[],"shared":true,"shareId":"x","keep":1`, 1)+`],"devices":[`+device+`]`))
	want := `{"lists":[{"id":"one","name":"One","createdAt":"2026-09-06","words":[{"display":"a","input":"a","annotation":""}],"records":[],"keep":1}],` +
		`"packs":null,"devices":[` + device + `],"revision":4,"accountId":"` + testOwner + `"}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want {
		t.Fatalf("response = %d %s; want %s", response.Code, response.Body, want)
	}
	expectPrivate(t, response)
	if fake.revision != 3 || !fake.change.HasLists || !fake.change.HasDevices || len(fake.change.Lists) != 1 || len(fake.change.Devices) != 1 {
		t.Fatalf("revision %d, change %+v", fake.revision, fake.change)
	}
	// A part left out stays as saved.
	fake.change = store.Change{}
	if response := h.put(testOwner, payload(testOwner, `"revision":4,"devices":[]`)); response.Code != http.StatusOK ||
		strings.TrimSpace(response.Body.String()) != `{"lists":[],"packs":null,"devices":[],"revision":5,"accountId":"`+testOwner+`"}` {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if fake.change.HasLists || !fake.change.HasDevices {
		t.Fatalf("change = %+v", fake.change)
	}
}

func TestPutFlow(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	expectSaved := func(response *httptest.ResponseRecorder, revision int) {
		t.Helper()
		fields := decodeBody(t, response)
		if response.Code != http.StatusOK || string(fields["revision"]) != fmt.Sprint(revision) || string(fields["accountId"]) != `"`+owner+`"` {
			t.Fatalf("response = %d %s; want revision %d", response.Code, response.Body, revision)
		}
		expectPrivate(t, response)
	}
	created := h.put(owner, payload(owner, `"revision":0,"lists":[`+oneList+`]`))
	expectSaved(created, 1)
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[]`)), http.StatusConflict, "conflict")
	expectError(t, h.put(owner, payload(owner, `"revision":9,"lists":[]`)), http.StatusConflict, "conflict")
	updated := h.put(owner, payload(owner, `"revision":1,"lists":[`+oneList+`,`+strings.Replace(oneList, `"one"`, `"two"`, 1)+`],"devices":[{"id":"mac","name":"MacBook","layout":"JIS"}]`))
	expectSaved(updated, 2)
	read := h.get(owner)
	expectSaved(read, 2)
	if !bytes.Equal(bytes.TrimSpace(read.Body.Bytes()), bytes.TrimSpace(updated.Body.Bytes())) {
		t.Fatalf("GET = %s\nPUT = %s", read.Body, updated.Body)
	}
	// Lists left out stay; the revision still moves.
	devicesOnly := h.put(owner, payload(owner, `"revision":2,"devices":[]`))
	expectSaved(devicesOnly, 3)
	fields := decodeBody(t, h.get(owner))
	var lists []json.RawMessage
	if err := json.Unmarshal(fields["lists"], &lists); err != nil || len(lists) != 2 || string(fields["devices"]) != "[]" {
		t.Fatalf("lists = %s, devices = %s", fields["lists"], fields["devices"])
	}
	// Another account's workspace is not this one's.
	if other := h.get(owner + "0"); string(decodeBody(t, other)["revision"]) != "0" {
		t.Fatalf("other account: %s", other.Body)
	}
}

func TestPutListLimit(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	var lists []string
	for i := 0; i < 101; i++ {
		lists = append(lists, aList(fmt.Sprintf("l%d", i), fmt.Sprintf("L%d", i)))
	}
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[`+strings.Join(lists, ",")+`]`)), http.StatusBadRequest, "listLimit")
	if string(decodeBody(t, h.get(owner))["revision"]) != "0" {
		t.Fatal("a refused save created the workspace")
	}
}

// The limits of validateLists are checked by the store, before the database: a list name that is too long is a 400.
func TestPutLimits(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	long := aList("one", strings.Repeat("a", workspace.MaxListName+1))
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[`+long+`]`)), http.StatusBadRequest, "invalidWorkspace")
	if string(decodeBody(t, h.get(owner))["revision"]) != "0" || len(h.reports) != 0 {
		t.Fatalf("a refused save created the workspace or was reported: %v", h.reports)
	}
}

// A lists-only save stores the group it sends, which becomes a pack's name when it is read, so a group longer than
// validateLists allows is refused, as the app does: a pack name over the limit would refuse every later save.
func TestPutGroupLimit(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	group := func(n int) string {
		return strings.Replace(oneList, `"records":[]`, `"records":[],"group":"`+strings.Repeat("g", n)+`"`, 1)
	}
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[`+group(workspace.MaxGroup+1)+`]`)), http.StatusBadRequest, "invalidWorkspace")
	if response := h.put(owner, payload(owner, `"revision":0,"lists":[`+group(workspace.MaxGroup)+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

// The store's own refusals keep their keys; anything else is a failed save.
func TestPutStoreErrors(t *testing.T) {
	cases := map[string]struct {
		err    error
		status int
		key    string
	}{
		"conflict":         {store.ErrConflict, http.StatusConflict, "conflict"},
		"wrapped conflict": {fmt.Errorf("save: %w", store.ErrConflict), http.StatusConflict, "conflict"},
		"list limit":       {&workspace.Error{Key: "listLimit"}, http.StatusBadRequest, "listLimit"},
		"invalid":          {&workspace.Error{Key: "invalidWorkspace"}, http.StatusBadRequest, "invalidWorkspace"},
		"other key":        {&workspace.Error{Key: "workspaceTooLarge"}, http.StatusServiceUnavailable, "workspaceSaveFailed"},
		"plain":            {errors.New("boom"), http.StatusServiceUnavailable, "workspaceSaveFailed"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, &fakeWorkspaces{fakeStore: fakeStore{err: c.err}}, testBase)
			expectError(t, h.put(testOwner, payload(testOwner, `"revision":0,"lists":[]`)), c.status, c.key)
			wantReports := 0
			if c.status == http.StatusServiceUnavailable {
				wantReports = 1
			}
			if len(h.reports) != wantReports {
				t.Fatalf("reports = %v", h.reports)
			}
		})
	}
}

func TestDatabaseDown(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{fakeStore: fakeStore{err: errors.New("connection refused")}}, testBase)
	expectError(t, h.get(testOwner), http.StatusServiceUnavailable, "databaseUnavailable")
	if len(h.reports) != 1 || h.reports[0] != "workspace.read" {
		t.Fatalf("reports = %v", h.reports)
	}
	expectError(t, h.put(testOwner, payload(testOwner, `"revision":0,"lists":[]`)), http.StatusServiceUnavailable, "workspaceSaveFailed")
	if len(h.reports) != 2 || h.reports[1] != "workspace.write" {
		t.Fatalf("reports = %v", h.reports)
	}
}

// A body that fails while it is read is a failed save, as in the route.
type brokenBody struct{}

func (brokenBody) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestPutBodyFails(t *testing.T) {
	h := newHarness(t, &fakeWorkspaces{}, testBase)
	r := httptest.NewRequest(http.MethodPut, "/api/workspace", brokenBody{})
	r.Header.Set("Origin", testBase)
	r.Header.Set("Content-Type", "application/json")
	r.AddCookie(h.cookie(testOwner, false))
	response := httptest.NewRecorder()
	h.handler.ServeHTTP(response, r)
	expectError(t, response, http.StatusServiceUnavailable, "workspaceSaveFailed")
	if len(h.reports) != 1 || h.reports[0] != "workspace.write" {
		t.Fatalf("reports = %v", h.reports)
	}
}

// Without a Report the failure is only logged.
func TestDefaultReport(t *testing.T) {
	keys, _ := session.NewKeys("test secret")
	parsed, _ := url.Parse(testBase)
	h := New(Config{Store: &fakeWorkspaces{fakeStore: fakeStore{err: errors.New("down")}}, Keys: keys, BaseURL: parsed})
	r := httptest.NewRequest(http.MethodGet, "/api/workspace", nil)
	r.AddCookie(&http.Cookie{Name: "typle-session", Value: keys.Seal(session.New(testOwner, "", "", time.Now()))})
	response := httptest.NewRecorder()
	h.ServeHTTP(response, r)
	expectError(t, response, http.StatusServiceUnavailable, "databaseUnavailable")
}

// A fixed clock decides when a session has expired.
func TestNowIsUsed(t *testing.T) {
	keys, _ := session.NewKeys("test secret")
	parsed, _ := url.Parse(testBase)
	issued := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	cookie := &http.Cookie{Name: "typle-session", Value: keys.Seal(session.New(testOwner, "", "", issued))}
	for now, status := range map[time.Time]int{issued.Add(time.Hour): http.StatusOK, issued.Add(session.MaxAge + time.Hour): http.StatusUnauthorized} {
		h := New(Config{Store: &fakeWorkspaces{}, Keys: keys, BaseURL: parsed, Now: func() time.Time { return now }})
		r := httptest.NewRequest(http.MethodGet, "/api/workspace", nil)
		r.AddCookie(cookie)
		response := httptest.NewRecorder()
		h.ServeHTTP(response, r)
		if response.Code != status {
			t.Errorf("at %v: response = %d %s", now, response.Code, response.Body)
		}
	}
}

// These are the inputs of tests/workspace.test.cjs for validateWorkspaceRequest, and what it does with each; this
// checks that the request is read the same way here. The limits of the lists (workspace.CheckLimits) and their number
// are checked by the store, not by the request: limits is a request that the store's CheckLimits refuses.
func TestMatchesTypeScript(t *testing.T) {
	const (
		accepted = iota
		invalid
		legacy
		limits
	)
	name201 := strings.Repeat("a", 201)
	many := make([]string, 101)
	for i := range many {
		many[i] = aList(fmt.Sprintf("l%d", i), fmt.Sprintf("L%d", i))
	}
	cases := []struct {
		name, body string
		want       int
		revision   int
		lists      int // -1 when left out
		devices    int
	}{
		{"sharing fields dropped", `{"revision":1,"lists":[` + strings.Replace(oneList, `"records":[]`, `"records":[],"shared":true,"shareId":"x"`, 1) + `]}`, accepted, 1, 1, -1},
		{"revision -1", `{"revision":-1,"lists":[]}`, invalid, 0, 0, 0},
		{"revision 1.5", `{"revision":1.5,"lists":[]}`, invalid, 0, 0, 0},
		{"revision string", `{"revision":"0","lists":[]}`, invalid, 0, 0, 0},
		{"revision NaN, which JSON writes as null", `{"revision":null,"lists":[]}`, invalid, 0, 0, 0},
		{"revision missing", `{"lists":[]}`, invalid, 0, 0, 0},
		{"revision 2^53", `{"revision":9007199254740992,"lists":[]}`, invalid, 0, 0, 0},
		{"revision 2^53-1", `{"revision":9007199254740991,"lists":[]}`, accepted, 9007199254740991, 0, -1},
		{"revision 1.0", `{"revision":1.0,"lists":[]}`, accepted, 1, 0, -1},
		{"revision 1e2", `{"revision":1e2,"lists":[]}`, accepted, 100, 0, -1},
		{"revision -0", `{"revision":-0,"lists":[]}`, accepted, 0, 0, -1},
		{"name of 201 characters", `{"revision":0,"lists":[` + aList("one", name201) + `]}`, limits, 0, 1, -1},
		{"name of 200 characters", `{"revision":0,"lists":[` + aList("one", name201[1:]) + `]}`, accepted, 0, 1, -1},
		{"profileId default", `{"revision":0,"profileId":"default","lists":[` + oneList + `]}`, accepted, 0, 1, -1},
		{"profileId zh", `{"revision":1,"profileId":"zh","lists":[]}`, legacy, 0, 0, 0},
		{"profiles with default", `{"revision":1,"profileId":"default","profiles":[{"id":"default","name":"メイン"}]}`, legacy, 0, 0, 0},
		{"101 lists", `{"revision":1,"lists":[` + strings.Join(many, ",") + `]}`, accepted, 1, 101, -1},
		{"devices", `{"revision":1,"devices":[{"id":"mac","name":" MacBook ","layout":"JIS"}]}`, accepted, 1, -1, 1},
		{"duplicate devices", `{"revision":1,"devices":[{"id":"mac","name":"a","layout":""},{"id":"mac","name":"b","layout":""}]}`, invalid, 0, 0, 0},
		{"lists left out", `{"revision":2}`, accepted, 2, -1, -1},
		{"not an object", `[1]`, invalid, 0, 0, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			revision, change, err := decodeRequest([]byte(c.body))
			switch c.want {
			case invalid:
				if err == nil || errors.Is(err, errLegacy) {
					t.Fatalf("err = %v; want invalid", err)
				}
			case legacy:
				if !errors.Is(err, errLegacy) {
					t.Fatalf("err = %v; want legacy", err)
				}
			case limits:
				var refused *workspace.Error
				if err != nil || !errors.As(workspace.CheckLimits(change.Lists), &refused) || refused.Key != "invalidWorkspace" {
					t.Fatalf("err = %v, limits not refused for %+v", err, change)
				}
			default:
				if err != nil {
					t.Fatal(err)
				}
				if revision != c.revision || change.HasLists != (c.lists >= 0) || change.HasDevices != (c.devices >= 0) ||
					len(change.Lists) != max(c.lists, 0) || len(change.Devices) != max(c.devices, 0) {
					t.Fatalf("revision %d, change %+v", revision, change)
				}
			}
		})
	}
	// The dropped fields are gone from what would be saved.
	_, change, _ := decodeRequest([]byte(cases[0].body))
	encoded, err := workspace.Encode(change.Lists)
	if err != nil || bytes.Contains(encoded, []byte("shared")) {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
	// A device's name is trimmed, as decodeDevices does.
	_, change, _ = decodeRequest([]byte(cases[17].body))
	if change.Devices[0].Name != "MacBook" {
		t.Fatalf("device = %+v", change.Devices[0])
	}
}

// PostgreSQL's jsonb cannot hold U+0000, so a NUL anywhere in what would be saved is an invalid workspace (400), found
// before the store, not a failed save (503). Escapes are read as JSON reads them: \\u0000 is a backslash, not a NUL.
func TestPutNUL(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	device := `{"id":"mac","name":"MacBook","layout":"JIS"}`
	for name, fields := range map[string]string{
		"list name":           `"revision":0,"lists":[` + aList("one", `a\u0000b`) + `]`,
		"unknown field":       `"revision":0,"lists":[` + strings.Replace(oneList, `"records":[]`, `"records":[],"x":{"y":["\u0000"]}`, 1) + `]`,
		"unknown key":         `"revision":0,"lists":[` + strings.Replace(oneList, `"records":[]`, `"records":[],"a\u0000":1`, 1) + `]`,
		"word":                `"revision":0,"lists":[` + strings.Replace(oneList, `"annotation":""`, `"annotation":"\u0000"`, 1) + `]`,
		"device":              `"revision":0,"devices":[` + strings.Replace(device, `"JIS"`, `"J\u0000"`, 1) + `]`,
		"unknown device item": `"revision":0,"devices":[` + strings.Replace(device, `}`, `,"n":"\u0000"}`, 1) + `]`,
	} {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put(testOwner, payload(testOwner, fields)), http.StatusBadRequest, "invalidWorkspace")
		})
	}
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
	escaped := h.put(testOwner, payload(testOwner, `"revision":0,"lists":[`+aList("one", `a\\u0000b`)+`]`))
	if escaped.Code != http.StatusOK || fake.writes != 1 || fake.change.Lists[0].Name != `a\u0000b` {
		t.Fatalf("escaped backslash: response = %d %s, change %+v", escaped.Code, escaped.Body, fake.change)
	}
}

// With the database: the NUL is refused before the save, so it is not reported as a failed one.
func TestPutNULRealStore(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[`+aList("one", `a\u0000b`)+`]`)), http.StatusBadRequest, "invalidWorkspace")
	if len(h.reports) != 0 {
		t.Fatalf("reports = %v", h.reports)
	}
}

// jsonb also refuses a UTF-16 surrogate escape that is not part of a pair, which Go would read as U+FFFD: it is refused
// as NUL is, before the store. A pair is a character like any other.
func TestPutLoneSurrogate(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	for name, fields := range map[string]string{
		"list name":     `"revision":0,"lists":[` + aList("one", `a\ud800b`) + `]`,
		"unknown field": `"revision":0,"lists":[` + strings.Replace(oneList, `"records":[]`, `"records":[],"x":["\uDC00"]`, 1) + `]`,
		"unknown key":   `"revision":0,"lists":[` + strings.Replace(oneList, `"records":[]`, `"records":[],"\ud83d":1`, 1) + `]`,
		"device":        `"revision":0,"devices":[{"id":"mac","name":"Mac\ud800","layout":"JIS"}]`,
	} {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put(testOwner, payload(testOwner, fields)), http.StatusBadRequest, "invalidWorkspace")
		})
	}
	if fake.writes != 0 {
		t.Fatalf("writes = %d", fake.writes)
	}
	pair := h.put(testOwner, payload(testOwner, `"revision":0,"lists":[`+aList("one", `\ud842\udfb7`)+`]`))
	if pair.Code != http.StatusOK || fake.change.Lists[0].Name != "𠮷" {
		t.Fatalf("surrogate pair: response = %d %s", pair.Code, pair.Body)
	}
}

// With the database: a lone surrogate in a field Typle does not know reaches jsonb as written, and is refused before.
func TestPutLoneSurrogateRealStore(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	list := strings.Replace(oneList, `"records":[]`, `"records":[],"x":"\ud800"`, 1)
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[`+list+`]`)), http.StatusBadRequest, "invalidWorkspace")
	if len(h.reports) != 0 {
		t.Fatalf("reports = %v", h.reports)
	}
}

const (
	aPack     = `{"id":"p","name":"P","category":"C","createdAt":"2026-09-06"}`
	packedOne = `{"id":"one","name":"One","packId":"p","createdAt":"2026-09-06","words":[{"display":"a","input":"a","annotation":""}],"records":[]}`
)

// packs are taken only with the lists they hold, and checked as sent, as validateWorkspaceRequest and validateLibrary
// do: a list of a save with packs has no labels of its own, not even empty ones.
func TestPutPacks(t *testing.T) {
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	response := h.put(testOwner, payload(testOwner, `"revision":1,"lists":[`+packedOne+`],"packs":[`+aPack+`]`))
	want := `{"lists":[` + packedOne + `],"packs":[` + aPack + `],"devices":[],"revision":2,"accountId":"` + testOwner + `"}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want {
		t.Fatalf("response = %d %s; want %s", response.Code, response.Body, want)
	}
	if !fake.change.HasLists || !fake.change.HasPacks || len(fake.change.Packs) != 1 || fake.change.Packs[0].Category != "C" {
		t.Fatalf("change = %+v", fake.change)
	}
	// A save from an app that does not know packs keeps the labels it sent on its lists.
	labeled := strings.Replace(oneList, `"records":[]`, `"records":[],"group":"G","category":"C","tags":["t"]`, 1)
	if response := h.put(testOwner, payload(testOwner, `"revision":2,"lists":[`+labeled+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if list := fake.change.Lists[0]; fake.change.HasPacks || list.Group != "G" || list.Category != "C" || list.PackID != "" {
		t.Fatalf("change = %+v", fake.change)
	}
	writes := fake.writes
	with := func(fields string) string {
		return strings.Replace(packedOne, `"records":[]`, `"records":[],`+fields, 1)
	}
	for name, fields := range map[string]string{
		"null packs":         `"lists":[` + packedOne + `],"packs":null`,
		"packs alone":        `"packs":[` + aPack + `]`,
		"packs with devices": `"devices":[],"packs":[` + aPack + `]`,
		"packs object":       `"lists":[` + packedOne + `],"packs":{}`,
		"missing pack":       `"lists":[` + strings.Replace(packedOne, `"p"`, `"q"`, 1) + `],"packs":[` + aPack + `]`,
		"empty category":     `"lists":[` + with(`"category":""`) + `],"packs":[` + aPack + `]`,
		"empty tags":         `"lists":[` + with(`"tags":[]`) + `],"packs":[` + aPack + `]`,
		"group":              `"lists":[` + with(`"group":"G"`) + `],"packs":[` + aPack + `]`,
		"null description":   `"lists":[` + packedOne + `],"packs":[` + strings.Replace(aPack, `"category":"C"`, `"description":null`, 1) + `]`,
		"pack without lists": `"lists":[` + packedOne + `],"packs":[` + aPack + `,{"id":"q","name":"Q","createdAt":"2026-09-06"}]`,
	} {
		t.Run(name, func(t *testing.T) {
			expectError(t, h.put(testOwner, payload(testOwner, `"revision":1,`+fields)), http.StatusBadRequest, "invalidWorkspace")
		})
	}
	if fake.writes != writes {
		t.Fatalf("writes = %d; want %d", fake.writes, writes)
	}
}

// Lists of a pack whose levels overlap are refused with levelsConflict when they are sent with their packs, and nothing
// is saved. An app that does not know packs sends its lists alone; they are separated when they are read.
func TestPutLevelsConflict(t *testing.T) {
	leveled := func(id string, levels string) string {
		return strings.Replace(packedOne, `"id":"one","name":"One"`, `"id":"`+id+`","name":"`+id+`","levels":`+levels, 1)
	}
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	expectError(t, h.put(testOwner, payload(testOwner, `"revision":1,"lists":[`+leveled("a", `["初級"]`)+`,`+leveled("b", `["初級"]`)+`],"packs":[`+aPack+`]`)),
		http.StatusBadRequest, "levelsConflict")
	if fake.writes != 0 {
		t.Fatalf("writes = %d; want 0", fake.writes)
	}
	// Data repaired on reading is saved as it is.
	if response := h.put(testOwner, payload(testOwner, `"revision":1,"lists":[`+leveled("a", `["初級"]`)+`,`+leveled("b", `["初級（2）"]`)+`],"packs":[`+aPack+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

// A list sent with its pack that has more than one level is refused with tooManyLevels, and nothing is saved.
func TestPutTooManyLevels(t *testing.T) {
	leveled := strings.Replace(packedOne, `"id":"one","name":"One"`, `"id":"one","name":"One","levels":["基本","初級"]`, 1)
	fake := &fakeWorkspaces{}
	h := newHarness(t, fake, testBase)
	expectError(t, h.put(testOwner, payload(testOwner, `"revision":1,"lists":[`+leveled+`],"packs":[`+aPack+`]`)), http.StatusBadRequest, "tooManyLevels")
	if fake.writes != 0 {
		t.Fatalf("writes = %d; want 0", fake.writes)
	}
	// Data repaired on reading is saved as it is.
	repaired := strings.Replace(leveled, `["基本","初級"]`, `["基本・初級"]`, 1)
	if response := h.put(testOwner, payload(testOwner, `"revision":1,"lists":[`+repaired+`],"packs":[`+aPack+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
}

// Lists sent alone by an app before v0.97.0 may have up to 5 levels: they are taken, and joined into one when they are
// read. More than 5 is invalid, as before.
func TestPutSeveralLevelsWithoutPacksRealStore(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	leveled := func(levels string) string {
		return strings.Replace(aList("a", "a"), `"records":[]`, `"records":[],"levels":`+levels, 1)
	}
	expectError(t, h.put(owner, payload(owner, `"revision":0,"lists":[`+leveled(`["1","2","3","4","5","6"]`)+`]`)), http.StatusBadRequest, "invalidWorkspace")
	if response := h.put(owner, payload(owner, `"revision":0,"lists":[`+leveled(`["基本"," 初級 ","","1","2"]`)+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	w, err := s.Read(context.Background(), owner)
	if err != nil || len(w.Lists) != 1 || !slices.Equal(w.Lists[0].Levels, []string{"基本・初級・1・2"}) {
		t.Fatalf("read = %+v, %v", w, err)
	}
}

func TestPutLevelsWithoutPacksRealStore(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	grouped := func(id string, levels string) string {
		return strings.Replace(aList(id, id), `"records":[]`, `"records":[],"group":"G","levels":`+levels, 1)
	}
	if response := h.put(owner, payload(owner, `"revision":0,"lists":[`+grouped("a", `["初級"]`)+`,`+grouped("b", `["初級"]`)+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	// GET gives the lists as they were saved, for the app to repair as it reads them; the server reads them repaired.
	var lists []struct{ Levels []string }
	if err := json.Unmarshal(decodeBody(t, h.get(owner))["lists"], &lists); err != nil || len(lists) != 2 || !slices.Equal(lists[1].Levels, []string{"初級"}) {
		t.Fatalf("lists = %+v, %v", lists, err)
	}
	w, err := s.Read(context.Background(), owner)
	if err != nil || len(w.Lists) != 2 || !slices.Equal(w.Lists[0].Levels, []string{"初級"}) || !slices.Equal(w.Lists[1].Levels, []string{"初級（2）"}) {
		t.Fatalf("read = %+v, %v", w, err)
	}
}

func TestPutPacksFlow(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	if packs := decodeBody(t, h.get(owner))["packs"]; string(packs) != "null" {
		t.Fatalf("packs = %s; want null without a row", packs)
	}
	if response := h.put(owner, payload(owner, `"revision":0,"lists":[`+oneList+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if packs := decodeBody(t, h.get(owner))["packs"]; string(packs) != "null" {
		t.Fatalf("packs = %s; want null for a row saved without packs", packs)
	}
	saved := h.put(owner, payload(owner, `"revision":1,"lists":[`+packedOne+`],"packs":[`+aPack+`]`))
	read := h.get(owner)
	if saved.Code != http.StatusOK || !bytes.Equal(bytes.TrimSpace(read.Body.Bytes()), bytes.TrimSpace(saved.Body.Bytes())) {
		t.Fatalf("PUT = %d %s\nGET = %s", saved.Code, saved.Body, read.Body)
	}
	var packs []map[string]any
	if err := json.Unmarshal(decodeBody(t, read)["packs"], &packs); err != nil || len(packs) != 1 || packs[0]["category"] != "C" {
		t.Fatalf("packs = %s", decodeBody(t, read)["packs"])
	}
	// Lists sent alone leave the saved packs as they are.
	if response := h.put(owner, payload(owner, `"revision":2,"lists":[`+packedOne+`,`+aList("two", "Two")+`]`)); response.Code != http.StatusOK {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if again := decodeBody(t, h.get(owner))["packs"]; !bytes.Equal(again, decodeBody(t, read)["packs"]) {
		t.Fatalf("packs = %s; want %s", again, decodeBody(t, read)["packs"])
	}
}
