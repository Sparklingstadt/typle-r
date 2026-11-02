package web

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/session"
	"github.com/sparklingstadt/typle-r/server/internal/store"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// fakeShares stands in for the links of the database: what reaches the store and how the handlers answer what comes
// back.
type fakeShares struct {
	fakeStore
	shares   []store.Share
	put      *store.Share
	putErr   error
	shared   json.RawMessage
	calls    []string
	owner    string
	packID   string
	sharedID string
}

func (f *fakeShares) PutShare(_ context.Context, owner, packID string, _ *bool) (*store.Share, error) {
	f.calls = append(f.calls, "put")
	f.owner, f.packID = owner, packID
	return f.put, f.putErr
}

func (f *fakeShares) DeleteShare(_ context.Context, owner, packID string) error {
	f.calls = append(f.calls, "delete")
	f.owner, f.packID = owner, packID
	return f.err
}

func (f *fakeShares) ListShares(_ context.Context, owner string) ([]store.Share, error) {
	f.calls = append(f.calls, "list")
	f.owner = owner
	return f.shares, f.err
}

func (f *fakeShares) SharedPack(_ context.Context, id string) (json.RawMessage, error) {
	f.calls = append(f.calls, "shared")
	f.sharedID = id
	return f.shared, f.err
}

// shareRequest is a signed-in request to /api/shares from the app's own origin, with a JSON body when there is one,
// unless the test changes it.
func (h *harness) shareRequest(method, target, body, owner string, change ...func(*http.Request)) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	r := httptest.NewRequest(method, target, reader)
	if method != http.MethodGet && method != http.MethodHead {
		r.Header.Set("Origin", testBase)
	}
	if body != "" {
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

var sharedAt = time.Date(2026, 10, 26, 9, 30, 15, 123456789, time.UTC)

func TestSharesLoginRequired(t *testing.T) {
	fake := &fakeShares{}
	h := newHarness(t, fake, testBase)
	expectError(t, h.shareRequest(http.MethodGet, "/api/shares", "", ""), http.StatusUnauthorized, "loginRequired")
	expectError(t, h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"p"}`, ""), http.StatusUnauthorized, "loginRequired")
	expectError(t, h.shareRequest(http.MethodDelete, "/api/shares?pack=p", "", ""), http.StatusUnauthorized, "loginRequired")
	if len(fake.calls) != 0 {
		t.Fatalf("calls = %v", fake.calls)
	}
}

// A cookie's request must come from the app's own origin, with a JSON body, as PUT /api/workspace; an app's token
// needs no Origin.
func TestSharesForbidden(t *testing.T) {
	fake := &fakeShares{put: &store.Share{ID: "i", PackID: "p", UpdatedAt: sharedAt}}
	h := newHarness(t, fake, testBase)
	noOrigin := func(r *http.Request) { r.Header.Del("Origin") }
	otherOrigin := func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }
	textPlain := func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }
	expectError(t, h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"p"}`, testOwner, noOrigin), http.StatusForbidden, "forbiddenRequest")
	expectError(t, h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"p"}`, testOwner, otherOrigin), http.StatusForbidden, "forbiddenRequest")
	expectError(t, h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"p"}`, testOwner, textPlain), http.StatusForbidden, "forbiddenRequest")
	expectError(t, h.shareRequest(http.MethodDelete, "/api/shares?pack=p", "", testOwner, noOrigin), http.StatusForbidden, "forbiddenRequest")
	if len(fake.calls) != 0 {
		t.Fatalf("calls = %v", fake.calls)
	}

	token := func(r *http.Request) {
		r.Header.Del("Origin")
		r.Header.Set("Authorization", "Bearer "+h.keys.SealApp(session.New(testOwner, "", "", time.Now())))
	}
	if response := h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"p"}`, "", token); response.Code != http.StatusOK {
		t.Fatalf("app token: %d %s", response.Code, response.Body)
	}
	if response := h.shareRequest(http.MethodDelete, "/api/shares?pack=p", "", "", token); response.Code != http.StatusNoContent {
		t.Fatalf("app token delete: %d %s", response.Code, response.Body)
	}
}

func TestSharesPutInvalid(t *testing.T) {
	fake := &fakeShares{put: &store.Share{ID: "i", PackID: "p", UpdatedAt: sharedAt}}
	h := newHarness(t, fake, testBase)
	for _, body := range []string{
		`[]`, `null`, `"p"`, `{}`, `{"packId":""}`, `{"packId":1}`, `{"packId":null}`, `{"packId":"p","more":1}`, `{`,
		`{"packId":"` + strings.Repeat("p", 5000) + `"}`,
	} {
		expectError(t, h.shareRequest(http.MethodPut, "/api/shares", body, testOwner), http.StatusBadRequest, "invalidWorkspace")
	}
	empty := func(r *http.Request) { r.Header.Set("Content-Type", "application/json") }
	expectError(t, h.shareRequest(http.MethodPut, "/api/shares", "", testOwner, empty), http.StatusBadRequest, "invalidWorkspace")
	expectError(t, h.shareRequest(http.MethodDelete, "/api/shares", "", testOwner), http.StatusBadRequest, "invalidWorkspace")
	expectError(t, h.shareRequest(http.MethodDelete, "/api/shares?pack=", "", testOwner), http.StatusBadRequest, "invalidWorkspace")
	if len(fake.calls) != 0 {
		t.Fatalf("calls = %v", fake.calls)
	}
}

func TestSharesPut(t *testing.T) {
	fake := &fakeShares{put: &store.Share{ID: "0b6f2c1e-3d4a-4f5b-8c9d-0e1f2a3b4c5d", PackID: "pk", Name: "Pack K", UpdatedAt: sharedAt}}
	h := newHarness(t, fake, testBase)
	response := h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"pk"}`, testOwner)
	want := `{"id":"0b6f2c1e-3d4a-4f5b-8c9d-0e1f2a3b4c5d","packId":"pk","name":"Pack K","updatedAt":"2026-10-26T09:30:15.123Z"}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want {
		t.Fatalf("response = %d %s; want %s", response.Code, response.Body, want)
	}
	expectPrivate(t, response)
	if fake.owner != testOwner || fake.packID != "pk" {
		t.Fatalf("store got %s %s", fake.owner, fake.packID)
	}
}

func TestDeleteShareWrongOrigin(t *testing.T) {
	fake := &fakeShares{}
	h := newHarness(t, fake, testBase)
	other := func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }
	expectError(t, h.shareRequest(http.MethodDelete, "/api/shares?pack=p", "", testOwner, other), http.StatusForbidden, "forbiddenRequest")
	if len(fake.calls) != 0 {
		t.Fatalf("calls = %v", fake.calls)
	}
}

func TestSharesPutRefused(t *testing.T) {
	cases := []struct {
		err    error
		status int
		key    string
	}{
		{&workspace.Error{Key: "packNotFound"}, http.StatusNotFound, "packNotFound"},
		{&workspace.Error{Key: "invalidWorkspace"}, http.StatusBadRequest, "invalidWorkspace"},
		{errors.New("down"), http.StatusServiceUnavailable, "workspaceSaveFailed"},
	}
	for _, tc := range cases {
		h := newHarness(t, &fakeShares{putErr: tc.err}, testBase)
		expectError(t, h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"pk"}`, testOwner), tc.status, tc.key)
		if want := tc.status == http.StatusServiceUnavailable; want != (len(h.reports) == 1 && h.reports[0] == "shares.write") {
			t.Fatalf("%v: reports = %v", tc.err, h.reports)
		}
	}
}

func TestSharesDelete(t *testing.T) {
	fake := &fakeShares{}
	h := newHarness(t, fake, testBase)
	response := h.shareRequest(http.MethodDelete, "/api/shares?pack=p%20k", "", testOwner)
	if response.Code != http.StatusNoContent || response.Body.Len() != 0 {
		t.Fatalf("response = %d %s", response.Code, response.Body)
	}
	if fake.owner != testOwner || fake.packID != "p k" {
		t.Fatalf("store got %s %q", fake.owner, fake.packID)
	}

	h = newHarness(t, &fakeShares{fakeStore: fakeStore{err: errors.New("down")}}, testBase)
	expectError(t, h.shareRequest(http.MethodDelete, "/api/shares?pack=p", "", testOwner), http.StatusServiceUnavailable, "workspaceSaveFailed")
	if len(h.reports) != 1 || h.reports[0] != "shares.write" {
		t.Fatalf("reports = %v", h.reports)
	}
}

func TestSharesList(t *testing.T) {
	fake := &fakeShares{}
	h := newHarness(t, fake, testBase)
	response := h.shareRequest(http.MethodGet, "/api/shares", "", testOwner)
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != `{"shares":[]}` {
		t.Fatalf("empty: %d %s", response.Code, response.Body)
	}
	expectPrivate(t, response)

	fake.shares = []store.Share{
		{ID: "b", PackID: "two", Name: "Two", UpdatedAt: sharedAt},
		{ID: "a", PackID: "one", Name: "One", UpdatedAt: sharedAt.Add(-time.Hour)},
	}
	response = h.shareRequest(http.MethodGet, "/api/shares", "", testOwner)
	want := `{"shares":[{"id":"b","packId":"two","name":"Two","updatedAt":"2026-10-26T09:30:15.123Z"},` +
		`{"id":"a","packId":"one","name":"One","updatedAt":"2026-10-26T08:30:15.123Z"}]}`
	if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != want || fake.owner != testOwner {
		t.Fatalf("response = %d %s (owner %s)", response.Code, response.Body, fake.owner)
	}

	h = newHarness(t, &fakeShares{fakeStore: fakeStore{err: errors.New("down")}}, testBase)
	expectError(t, h.shareRequest(http.MethodGet, "/api/shares", "", testOwner), http.StatusServiceUnavailable, "databaseUnavailable")
	if len(h.reports) != 1 || h.reports[0] != "shares.read" {
		t.Fatalf("reports = %v", h.reports)
	}
}

func TestSharesMethod(t *testing.T) {
	h := newHarness(t, &fakeShares{}, testBase)
	for _, method := range []string{http.MethodPost, http.MethodPatch} {
		response := h.shareRequest(method, "/api/shares", "", testOwner)
		if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "GET, HEAD, PUT, DELETE" {
			t.Fatalf("%s: response = %d %v", method, response.Code, response.Header())
		}
	}
}

const aSharedID = "0b6f2c1e-3d4a-4f5b-8c9d-0e1f2a3b4c5d"

func getShared(t *testing.T, handler http.Handler, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(method, target, nil))
	return response
}

func TestSharedNotFound(t *testing.T) {
	fake := &fakeShares{}
	h := newHarness(t, fake, testBase)
	for _, target := range []string{"/api/shared", "/api/shared?id=", "/api/shared?id=nope", "/api/shared?id=" + aSharedID} {
		response := getShared(t, h.handler, http.MethodGet, target)
		expectError(t, response, http.StatusNotFound, "sharedPackNotFound")
		if response.Header().Get("X-Robots-Tag") != "noindex" {
			t.Fatalf("%s: X-Robots-Tag = %q", target, response.Header().Get("X-Robots-Tag"))
		}
	}
	// The store tells what is not a link (an id that is not a UUID included); the handler passes the id as it came.
	if fake.sharedID != aSharedID {
		t.Fatalf("id = %q", fake.sharedID)
	}
}

// Anyone with the link reads the snapshot itself, without a cookie, and nothing keeps it.
func TestShared(t *testing.T) {
	snapshot := `{"format":"typle-pack","version":1,"pack":{"name":"P"},"lists":[]}`
	fake := &fakeShares{shared: json.RawMessage(snapshot)}
	for name, handler := range map[string]http.Handler{
		"New":    newHarness(t, fake, testBase).handler,
		"Shared": Shared(fake, nil),
	} {
		response := getShared(t, handler, http.MethodGet, "/api/shared?id="+aSharedID)
		if response.Code != http.StatusOK || response.Body.String() != snapshot {
			t.Fatalf("%s: response = %d %s", name, response.Code, response.Body)
		}
		header := response.Header()
		if header.Get("Content-Type") != "application/json; charset=utf-8" || header.Get("Cache-Control") != "no-store" {
			t.Fatalf("%s: headers = %v", name, header)
		}
		checkSecurityHeaders(t, name, header)
		if header.Get("X-Robots-Tag") != "noindex" {
			t.Fatalf("%s: X-Robots-Tag = %q", name, header.Get("X-Robots-Tag"))
		}
		if strings.Contains(response.Body.String(), "owner") {
			t.Fatalf("%s: body has the owner: %s", name, response.Body)
		}
		if fake.sharedID != aSharedID {
			t.Fatalf("%s: id = %q", name, fake.sharedID)
		}
	}
}

func TestSharedHeadAndMethod(t *testing.T) {
	fake := &fakeShares{shared: json.RawMessage(`{"format":"typle-pack"}`)}
	h := newHarness(t, fake, testBase)
	server := httptest.NewServer(h.handler)
	defer server.Close()
	response, err := server.Client().Head(server.URL + "/api/shared?id=" + aSharedID)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK || len(body) != 0 || response.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("HEAD = %d %q %v", response.StatusCode, body, response.Header)
	}
	post := getShared(t, h.handler, http.MethodPost, "/api/shared?id="+aSharedID)
	if post.Code != http.StatusMethodNotAllowed || post.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("POST = %d %v", post.Code, post.Header())
	}
	if post.Header().Get("X-Robots-Tag") != "noindex" {
		t.Fatalf("POST: X-Robots-Tag = %q", post.Header().Get("X-Robots-Tag"))
	}
}

func TestSharedDown(t *testing.T) {
	var reported []string
	handler := Shared(&fakeShares{fakeStore: fakeStore{err: errors.New("down")}}, func(_ *http.Request, _ error, operation string) {
		reported = append(reported, operation)
	})
	down := getShared(t, handler, http.MethodGet, "/api/shared?id="+aSharedID)
	expectError(t, down, http.StatusServiceUnavailable, "databaseUnavailable")
	if down.Header().Get("X-Robots-Tag") != "noindex" {
		t.Fatalf("503: X-Robots-Tag = %q", down.Header().Get("X-Robots-Tag"))
	}
	if len(reported) != 1 || reported[0] != "shared.read" {
		t.Fatalf("reported = %v", reported)
	}
}

// With a real database: a pack of the owner's is shared, listed, read by anyone without the owner, and unshared. The
// owner starts empty, so the pack is made first.
func TestSharesRealDatabase(t *testing.T) {
	s, owner := realStore(t)
	h := newHarness(t, s, testBase)
	name := "動物"
	saved, err := s.Modify(context.Background(), owner, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.CreateList(w, workspace.ListInput{Name: &name, Words: []workspace.Word{{Display: "cat", Input: "cat"}}},
			workspace.NewID(), time.Now())
		return true, err
	})
	if err != nil {
		t.Fatal(err)
	}
	packID := saved.Packs[0].ID
	t.Cleanup(func() { _ = s.DeleteShare(context.Background(), owner, packID) })

	expectError(t, h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"nope"}`, owner), http.StatusNotFound, "packNotFound")
	response := h.shareRequest(http.MethodPut, "/api/shares", `{"packId":"`+packID+`"}`, owner)
	if response.Code != http.StatusOK {
		t.Fatalf("put = %d %s", response.Code, response.Body)
	}
	var share struct{ ID, PackID, UpdatedAt string }
	if err := json.Unmarshal(response.Body.Bytes(), &share); err != nil || share.PackID != packID || share.ID == "" {
		t.Fatalf("put body %s: %v", response.Body, err)
	}
	if list := h.shareRequest(http.MethodGet, "/api/shares", "", owner); !strings.Contains(list.Body.String(), share.ID) {
		t.Fatalf("list = %s", list.Body)
	}
	read := getShared(t, h.handler, http.MethodGet, "/api/shared?id="+share.ID)
	want, err := workspace.EncodePackFile(saved, packID)
	if err != nil {
		t.Fatal(err)
	}
	if read.Code != http.StatusOK || read.Body.String() != string(want) || strings.Contains(read.Body.String(), owner) {
		t.Fatalf("shared = %d %s", read.Code, read.Body)
	}
	if deleted := h.shareRequest(http.MethodDelete, "/api/shares?pack="+packID, "", owner); deleted.Code != http.StatusNoContent {
		t.Fatalf("delete = %d", deleted.Code)
	}
	expectError(t, getShared(t, h.handler, http.MethodGet, "/api/shared?id="+share.ID), http.StatusNotFound, "sharedPackNotFound")
}
