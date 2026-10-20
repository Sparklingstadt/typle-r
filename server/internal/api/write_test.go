package api

import (
	"context"
	"errors"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// writer keeps a workspace for every account, starting from savedLists, and saves a change only when it succeeds,
// as the store's transaction does.
type writer struct {
	t         *testing.T
	workspace *workspace.Workspace
	err       error
	owners    []string
}

func (w *writer) Read(_ context.Context, owner string) (*workspace.Workspace, error) {
	return w.copy(), nil
}

func (w *writer) copy() *workspace.Workspace {
	encoded, err := workspace.Encode(w.workspace.Lists)
	if err != nil {
		w.t.Fatal(err)
	}
	copied, err := workspace.Decode(encoded, []byte(savedDevices))
	if err != nil {
		w.t.Fatal(err)
	}
	return copied
}

func (w *writer) Modify(_ context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error) {
	w.owners = append(w.owners, owner)
	if w.err != nil {
		return nil, w.err
	}
	next := w.copy()
	if _, err := change(next); err != nil {
		return nil, err
	}
	w.workspace = next
	return next, nil
}

func writable(t *testing.T) *writer {
	return &writer{t: t, workspace: saved(t).workspace}
}

func send(w *writer, method, target, body string) *httptest.ResponseRecorder {
	return sendAs(w, "Bearer alice", method, target, "application/json", body)
}

func sendAs(w *writer, authorization, method, target, contentType, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if authorization != "" {
		request.Header.Set("Authorization", authorization)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	response := httptest.NewRecorder()
	New(w, w, verifier{}).ServeHTTP(response, request)
	return response
}

var uuid = regexp.MustCompile(`"id":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"`)

func TestCreateList(t *testing.T) {
	w := writable(t)
	response := send(w, "POST", "/api/v1/lists", `{"name":"動物","words":[{"display":"cat","input":"cat"}]}`)
	got := body(t, response)
	if response.Code != 201 || !uuid.MatchString(got) {
		t.Fatalf("%d %s", response.Code, got)
	}
	created := uuid.ReplaceAllString(got, `"id":"x"`)
	created = regexp.MustCompile(`"createdAt":"[^"]+"`).ReplaceAllString(created, `"createdAt":"t"`)
	if created != `{"list":{"id":"x","name":"動物","wordCount":1,"recordCount":0,"createdAt":"t","words":[{"display":"cat","input":"cat","annotation":""}]}}` {
		t.Fatalf("body = %s", created)
	}
	if response.Header().Get("Content-Type") != "application/json; charset=utf-8" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", response.Header())
	}
	if len(w.workspace.Lists) != 3 || w.workspace.Lists[2].Name != "動物" {
		t.Fatalf("lists = %+v", w.workspace.Lists)
	}
}

func TestUpdateList(t *testing.T) {
	w := writable(t)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1", `{"name":"English"}`), 200, `{"list":{"id":"l1","name":"English","wordCount":2,
	  "recordCount":3,"createdAt":"2026-10-10T01:23:45.000Z","words":[{"display":"apple","input":"apple","annotation":"りんご"},
	  {"display":"pear","input":"pear","annotation":""}]}}`)
}

func TestDeleteList(t *testing.T) {
	w := writable(t)
	response := send(w, "DELETE", "/api/v1/lists/l2", "")
	if response.Code != 204 || response.Body.Len() != 0 || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %q %v", response.Code, response.Body, response.Header())
	}
	expect(t, send(w, "GET", "/api/v1/lists/l2", ""), 404, `{"error":"listNotFound"}`)
}

func TestAddRecord(t *testing.T) {
	w := writable(t)
	run := `{"id":"r9","time":3,"date":"2026-10-12T00:00:00Z","mistakes":0,"accuracy":100}`
	want := `{"record":{"id":"r9","time":3,"date":"2026-10-12T00:00:00.000Z","mistakes":0,"accuracy":100,"wordCount":2}}`
	expect(t, send(w, "POST", "/api/v1/lists/l1/records", run), 201, want)
	expect(t, send(w, "POST", "/api/v1/lists/l1/records", run), 200, want)
	if len(w.workspace.Lists[0].Records) != 4 {
		t.Fatalf("records = %+v", w.workspace.Lists[0].Records)
	}
}

func TestReadOnlyRefusesWrites(t *testing.T) {
	s := saved(t)
	request := httptest.NewRequest("POST", "/api/v1/lists", strings.NewReader(`{"name":"a","words":[{"display":"a","input":"a"}]}`))
	request.Header.Set("Authorization", "Bearer alice")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	New(s, nil, verifier{}).ServeHTTP(response, request)
	expect(t, response, 405, `{"error":"methodNotAllowed"}`)
	if response.Header().Get("Allow") != "GET, HEAD" || len(s.owners) != 0 {
		t.Fatalf("Allow = %q, reads = %v", response.Header().Get("Allow"), s.owners)
	}
}

func TestAllowHeaders(t *testing.T) {
	allowed := map[string]string{
		"/api/v1/devices":          "GET, HEAD",
		"/api/v1/lists":            "GET, HEAD, POST",
		"/api/v1/lists/l1":         "GET, HEAD, PATCH, DELETE",
		"/api/v1/lists/l1/records": "GET, HEAD, POST",
	}
	for path, allow := range allowed {
		w := writable(t)
		response := send(w, "PUT", path, `{}`)
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if response.Header().Get("Allow") != allow || len(w.owners) != 0 {
			t.Fatalf("%s: Allow = %q", path, response.Header().Get("Allow"))
		}
	}
	for _, path := range []string{"/api/v1/devices", "/api/v1/lists/l1"} {
		expect(t, send(writable(t), "POST", path, `{}`), 405, `{"error":"methodNotAllowed"}`)
	}
}

func TestWriteBodyErrors(t *testing.T) {
	list := `{"name":"a","words":[{"display":"a","input":"a"}]}`
	cases := []struct {
		name, method, target, contentType, body string
		status                                  int
		key                                     string
	}{
		{"text", "POST", "/api/v1/lists", "text/plain", list, 415, "unsupportedContentType"},
		{"no type", "POST", "/api/v1/lists", "", list, 415, "unsupportedContentType"},
		{"too large", "POST", "/api/v1/lists", "application/json", `{"name":"` + strings.Repeat("a", 1<<20) + `"}`, 413, "requestTooLarge"},
		{"null", "POST", "/api/v1/lists", "application/json", "null", 400, "invalidJson"},
		{"empty", "POST", "/api/v1/lists", "application/json", "", 400, "invalidJson"},
		{"broken", "POST", "/api/v1/lists", "application/json", "{", 400, "invalidJson"},
		{"unknown field", "POST", "/api/v1/lists", "application/json", `{"name":"a","x":1}`, 400, "invalidJson"},
		{"unknown word field", "POST", "/api/v1/lists", "application/json", `{"name":"a","words":[{"display":"a","input":"a","x":1}]}`, 400, "invalidJson"},
		{"two values", "POST", "/api/v1/lists", "application/json", list + ` {}`, 400, "invalidJson"},
		{"wrong type", "POST", "/api/v1/lists/l1/records", "application/json", `{"time":"3"}`, 400, "invalidJson"},
		{"array", "POST", "/api/v1/lists", "application/json", `[]`, 400, "invalidJson"},
		{"nothing to change", "PATCH", "/api/v1/lists/l1", "application/json", `{}`, 400, "invalidJson"},
		{"only nulls", "PATCH", "/api/v1/lists/l1", "application/json", `{"name":null,"words":null}`, 400, "invalidJson"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := writable(t)
			expect(t, sendAs(w, "Bearer alice", c.method, c.target, c.contentType, c.body), c.status, `{"error":"`+c.key+`"}`)
			if len(w.owners) != 0 {
				t.Fatalf("modified %v", w.owners)
			}
		})
	}
	// Parameters of the media type are allowed.
	if response := sendAs(writable(t), "Bearer alice", "POST", "/api/v1/lists", "Application/JSON; charset=utf-8", list); response.Code != 201 {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
}

func TestWriteErrorStatuses(t *testing.T) {
	expect(t, send(writable(t), "POST", "/api/v1/lists", `{"name":"英単語","words":[{"display":"a","input":"a"}]}`), 400, `{"error":"listNameDuplicate"}`)
	expect(t, send(writable(t), "PATCH", "/api/v1/lists/missing", `{"name":"a"}`), 404, `{"error":"listNotFound"}`)
	expect(t, send(writable(t), "DELETE", "/api/v1/lists/missing", ""), 404, `{"error":"listNotFound"}`)
	expect(t, send(writable(t), "POST", "/api/v1/lists/missing/records", `{"time":1,"date":"2026-10-12","mistakes":0,"accuracy":1}`), 404, `{"error":"listNotFound"}`)
	expect(t, send(writable(t), "POST", "/api/v1/lists/l1/records", `{"time":1,"date":"2026-10-12","mistakes":1.5,"accuracy":1}`), 400, `{"error":"invalidRecord"}`)
	expect(t, send(writable(t), "POST", "/api/v1/lists/l1/records", `{"time":1,"date":"2026-10-12","mistakes":1,"accuracy":1,"deviceId":"zz"}`), 400, `{"error":"deviceNotFound"}`)
	tooLarge := writable(t)
	tooLarge.err = &workspace.Error{Key: "workspaceTooLarge"}
	expect(t, send(tooLarge, "PATCH", "/api/v1/lists/l1", `{"name":"a"}`), 413, `{"error":"workspaceTooLarge"}`)
	failing := writable(t)
	failing.err = errors.New("connection refused")
	expect(t, send(failing, "DELETE", "/api/v1/lists/l1", ""), 503, `{"error":"databaseUnavailable"}`)
}

func TestWriteAuthFirst(t *testing.T) {
	w := writable(t)
	huge := strings.Repeat("x", 2<<20)
	response := sendAs(w, "", "POST", "/api/v1/lists", "text/plain", huge)
	expect(t, response, 401, `{"error":"invalidToken"}`)
	if response.Header().Get("WWW-Authenticate") != "Bearer" {
		t.Fatal("no WWW-Authenticate")
	}
	expect(t, sendAs(w, "Bearer down", "DELETE", "/api/v1/lists/l1", "", ""), 503, `{"error":"githubUnavailable"}`)
	if len(w.owners) != 0 {
		t.Fatalf("modified %v", w.owners)
	}
}

func TestWriteOwnAccount(t *testing.T) {
	w := writable(t)
	sendAs(w, "Bearer bob", "DELETE", "/api/v1/lists/l1", "", "")
	if strings.Join(w.owners, ",") != "github:2" {
		t.Fatalf("owners = %v", w.owners)
	}
}
