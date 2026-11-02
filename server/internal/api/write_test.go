package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// writer keeps a workspace for every account, starting from savedLists, and saves a change only when it succeeds,
// with its lists' changes put back into the packs, as the store's transaction does.
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
	devices, err := workspace.EncodeDevices(w.workspace.Devices)
	if err != nil {
		w.t.Fatal(err)
	}
	packs, err := workspace.EncodePacks(w.workspace.Packs)
	if err != nil {
		w.t.Fatal(err)
	}
	copied, err := workspace.Decode(encoded, devices, packs)
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
	previous, next := w.copy(), w.copy()
	if _, err := change(next); err != nil {
		return nil, err
	}
	next.ApplyListChange(previous)
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
	// The list's pack is the one ApplyListChange made for it, named by the list's id.
	id := w.workspace.Lists[len(w.workspace.Lists)-1].ID
	if !strings.Contains(got, `"id":"`+id+`","name":"動物","packId":"pack-`+id+`"`) {
		t.Fatalf("body = %s", got)
	}
	created := strings.ReplaceAll(got, id, "x")
	created = regexp.MustCompile(`"createdAt":"[^"]+"`).ReplaceAllString(created, `"createdAt":"t"`)
	if created != `{"list":{"id":"x","name":"動物","packId":"pack-x","category":null,"tags":[],"levels":[],"wordCount":1,"recordCount":0,"createdAt":"t","practiceCount":0,"lastPracticed":null,"currentRecordCount":0,"origin":null,"words":[{"display":"cat","input":"cat","annotation":""}]}}` {
		t.Fatalf("body = %s", created)
	}
	if response.Header().Get("Content-Type") != "application/json; charset=utf-8" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", response.Header())
	}
	if len(w.workspace.Lists) != 3 || w.workspace.Lists[2].Name != "動物" {
		t.Fatalf("lists = %+v", w.workspace.Lists)
	}
}

func TestListLabels(t *testing.T) {
	w := writable(t)
	response := send(w, "POST", "/api/v1/lists", `{"name":"Go","category":" プログラミング ","tags":["Go"," go","","CLI"],"words":[{"display":"go","input":"go"}]}`)
	got := body(t, response)
	if response.Code != 201 || !strings.Contains(got, `"category":"プログラミング","tags":["Go","CLI"],"levels":[],"wordCount":1`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	id := w.workspace.Lists[2].ID
	if response := send(w, "PATCH", "/api/v1/lists/"+id, `{"tags":["Go"]}`); response.Code != 200 ||
		!strings.Contains(body(t, response), `"category":"プログラミング","tags":["Go"]`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	if response := send(w, "POST", "/api/v1/lists/"+id+"/copy", ""); response.Code != 201 ||
		!strings.Contains(body(t, response), `"category":"プログラミング","tags":["Go"]`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	names := func(query string) string {
		response := send(w, "GET", "/api/v1/lists?"+query, "")
		var answer struct{ Lists []struct{ Name string } }
		if err := json.Unmarshal(response.Body.Bytes(), &answer); err != nil {
			t.Fatal(err)
		}
		var found []string
		for _, list := range answer.Lists {
			found = append(found, list.Name)
		}
		return strings.Join(found, ",")
	}
	for query, want := range map[string]string{"category=%E3%83%97%E3%83%AD%E3%82%B0%E3%83%A9%E3%83%9F%E3%83%B3%E3%82%B0": "Go,Go（コピー）",
		"category=": "英単語,空", "tag=GO": "Go,Go（コピー）", "tag=go&tag=cli": "", "q=%E3%83%97%E3%83%AD": "Go,Go（コピー）"} {
		if got := names(query); got != want {
			t.Errorf("%s: %s, want %s", query, got, want)
		}
	}
	if response := send(w, "PATCH", "/api/v1/lists/"+id, `{"category":"","tags":[]}`); response.Code != 200 ||
		!strings.Contains(body(t, response), `"category":null,"tags":[]`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	expect(t, send(w, "PATCH", "/api/v1/lists/"+id, `{"category":"`+strings.Repeat("c", 51)+`"}`), 400, `{"error":"invalidList"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/"+id, `{"tags":["`+strings.Repeat("t", 51)+`"]}`), 400, `{"error":"invalidList"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/"+id, `{"tags":"Go"}`), 400, `{"error":"invalidJson"}`)
}

func TestUpdateList(t *testing.T) {
	w := writable(t)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1", `{"name":"English"}`), 200, `{"list":{"id":"l1","name":"English","packId":"pack-l1","category":null,"tags":[],"levels":[],"wordCount":2,
	  "recordCount":3,"createdAt":"2026-10-10T01:23:45.000Z","practiceCount":3,"lastPracticed":"2026-10-03T00:00:00.000Z","currentRecordCount":1,"origin":null,"words":[{"display":"apple","input":"apple","annotation":"りんご"},
	  {"display":"pear","input":"pear","annotation":""}]}}`)
}

// A list alone in its pack names the pack, so it may not take another pack's name; within a pack of several, names only
// differ from the pack's other lists.
func TestUpdateListRenameAgainstPacks(t *testing.T) {
	w := writable(t)
	encode := func() string {
		lists, err := workspace.Encode(w.workspace.Lists)
		if err != nil {
			t.Fatal(err)
		}
		packs, err := workspace.EncodePacks(w.workspace.Packs)
		if err != nil {
			t.Fatal(err)
		}
		return string(lists) + string(packs)
	}
	before := encode()
	expect(t, send(w, "PATCH", "/api/v1/lists/l1", `{"name":"空"}`), 400, `{"error":"listNameDuplicate"}`)
	if after := encode(); after != before {
		t.Fatalf("workspace changed: %s", after)
	}
	if response := send(w, "POST", "/api/v1/lists", `{"name":"X","packId":"pack-l2","words":[{"display":"a","input":"a"}]}`); response.Code != 201 {
		t.Fatalf("%d %s", response.Code, body(t, response))
	}
	id := w.workspace.Lists[len(w.workspace.Lists)-1].ID
	if response := send(w, "PATCH", "/api/v1/lists/"+id, `{"name":"英単語"}`); response.Code != 200 {
		t.Fatalf("%d %s", response.Code, body(t, response))
	}
	var names []string
	for _, pack := range w.workspace.Packs {
		names = append(names, pack.Name)
	}
	if strings.Join(names, ",") != "英単語,空" {
		t.Fatalf("packs = %v", names)
	}
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

func TestAddRecordRefusesMode(t *testing.T) {
	w := writable(t)
	run := `{"id":"r9","time":3,"date":"2026-10-12T00:00:00Z","mistakes":0,"accuracy":100,"mode":"recall"}`
	expect(t, send(w, "POST", "/api/v1/lists/l1/records", run), 400, `{"error":"invalidJson"}`)
	if len(w.owners) != 0 || len(w.workspace.Lists[0].Records) != 3 {
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
		"/api/v1/devices":              "GET, HEAD, POST",
		"/api/v1/devices/d1":           "GET, HEAD, PATCH, DELETE",
		"/api/v1/lists":                "GET, HEAD, POST",
		"/api/v1/lists/l1":             "GET, HEAD, PATCH, DELETE",
		"/api/v1/lists/l1/records":     "GET, HEAD, POST",
		"/api/v1/lists/l1/records/new": "GET, HEAD, PATCH, DELETE",
	}
	for path, allow := range allowed {
		w := writable(t)
		response := send(w, "PUT", path, `{}`)
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if response.Header().Get("Allow") != allow || len(w.owners) != 0 {
			t.Fatalf("%s: Allow = %q", path, response.Header().Get("Allow"))
		}
	}
	for _, path := range []string{"/api/v1/devices/d1", "/api/v1/lists/l1"} {
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
		{"key in another case", "POST", "/api/v1/lists", "application/json", `{"NAME":"a","words":[{"display":"a","input":"a"}]}`, 400, "invalidJson"},
		{"word key in another case", "POST", "/api/v1/lists", "application/json", `{"name":"a","words":[{"Display":"a","input":"a"}]}`, 400, "invalidJson"},
		{"record key in another case", "POST", "/api/v1/lists/l1/records", "application/json", `{"Time":1,"date":"2026-10-12","mistakes":0,"accuracy":1}`, 400, "invalidJson"},
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
	// Only the media type before ";" is looked at, as the app's own route does, so even a broken parameter is allowed.
	for _, contentType := range []string{"Application/JSON; charset=utf-8", "application/json; charset", " application/json ;x"} {
		if response := sendAs(writable(t), "Bearer alice", "POST", "/api/v1/lists", contentType, list); response.Code != 201 {
			t.Fatalf("%q: %d %s", contentType, response.Code, response.Body)
		}
	}
	expect(t, sendAs(writable(t), "Bearer alice", "POST", "/api/v1/lists", "application/jsonx", list), 415, `{"error":"unsupportedContentType"}`)
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

func TestCreateDevice(t *testing.T) {
	w := writable(t)
	response := send(w, "POST", "/api/v1/devices", `{"name":" 会社 ","layout":"US"}`)
	got := body(t, response)
	if response.Code != 201 || !uuid.MatchString(got) {
		t.Fatalf("%d %s", response.Code, got)
	}
	if created := uuid.ReplaceAllString(got, `"id":"x"`); created != `{"device":{"id":"x","name":"会社","layout":"US"}}` {
		t.Fatalf("body = %s", created)
	}
	if len(w.workspace.Devices) != 2 || w.workspace.Devices[1].Name != "会社" {
		t.Fatalf("devices = %+v", w.workspace.Devices)
	}
}

func TestDevice(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/devices/d1"), 200, `{"device":{"id":"d1","name":"自宅","layout":"JIS","practiceCount":1,
	  "lastPracticed":"2026-10-03T00:00:00.000Z"}}`)
	expect(t, serve(t, "GET", "/api/v1/devices/missing"), 404, `{"error":"deviceNotFound"}`)
	expect(t, serve(t, "GET", "/api/v1/devices/default"), 404, `{"error":"deviceNotFound"}`)
}

func TestUpdateDevice(t *testing.T) {
	w := writable(t)
	expect(t, send(w, "PATCH", "/api/v1/devices/d1", `{"layout":"US"}`), 200, `{"device":{"id":"d1","name":"自宅","layout":"US"}}`)
	expect(t, send(w, "PATCH", "/api/v1/devices/d1", `{}`), 400, `{"error":"invalidJson"}`)
	expect(t, send(w, "PATCH", "/api/v1/devices/missing", `{"name":"a"}`), 404, `{"error":"deviceNotFound"}`)
	expect(t, send(w, "PATCH", "/api/v1/devices/d1", `{"name":"Default"}`), 400, `{"error":"deviceNameDuplicate"}`)
	expect(t, send(w, "PATCH", "/api/v1/devices/d1", `{"Name":"a"}`), 400, `{"error":"invalidJson"}`)
}

func TestDeleteDevice(t *testing.T) {
	w := writable(t)
	response := send(w, "DELETE", "/api/v1/devices/d1", "")
	if response.Code != 204 || response.Body.Len() != 0 || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %q %v", response.Code, response.Body, response.Header())
	}
	expect(t, send(w, "GET", "/api/v1/devices", ""), 200, `{"devices":[],"default":{"practiceCount":0,"lastPracticed":null}}`)
	expect(t, send(w, "DELETE", "/api/v1/devices/d1", ""), 404, `{"error":"deviceNotFound"}`)
	// Records keep their copy of the deleted device.
	if !strings.Contains(body(t, send(w, "GET", "/api/v1/lists/l1/records", "")), `"device":{"id":"d1","name":"自宅","layout":"JIS"}`) {
		t.Fatal("record lost its device")
	}
}

func TestDeviceWritesNeedWritable(t *testing.T) {
	for _, c := range []struct{ method, path string }{{"POST", "/api/v1/devices"}, {"PATCH", "/api/v1/devices/d1"}, {"DELETE", "/api/v1/devices/d1"}} {
		response := serveAs(saved(t), "Bearer alice", c.method, c.path)
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if response.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("%s %s: Allow = %q", c.method, c.path, response.Header().Get("Allow"))
		}
	}
}

func TestRecord(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/lists/l1/records/mid"), 200, `{"record":{"id":"mid","time":6,"date":"2026-10-02T00:00:00.000Z"}}`)
	expect(t, serve(t, "GET", "/api/v1/lists/l1/records/missing"), 404, `{"error":"recordNotFound"}`)
	expect(t, serve(t, "GET", "/api/v1/lists/missing/records/mid"), 404, `{"error":"listNotFound"}`)
}

func TestUpdateRecord(t *testing.T) {
	w := writable(t)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/mid", `{"accuracy":90,"date":"2026-10-02T09:00:00+09:00","deviceId":"d1"}`), 200,
		`{"record":{"id":"mid","time":6,"date":"2026-10-02T00:00:00.000Z","accuracy":90,"device":{"id":"d1","name":"自宅","layout":"JIS"}}}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/mid", `{"deviceId":""}`), 200,
		`{"record":{"id":"mid","time":6,"date":"2026-10-02T00:00:00.000Z","accuracy":90}}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/mid", `{}`), 400, `{"error":"invalidJson"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/mid", `{"id":"other"}`), 400, `{"error":"invalidJson"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/mid", `{"mistakes":-1}`), 400, `{"error":"invalidRecord"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/mid", `{"deviceId":"zz"}`), 400, `{"error":"deviceNotFound"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/l1/records/missing", `{"time":1}`), 404, `{"error":"recordNotFound"}`)
}

func TestDeleteRecord(t *testing.T) {
	w := writable(t)
	response := send(w, "DELETE", "/api/v1/lists/l1/records/new", "")
	if response.Code != 204 || response.Body.Len() != 0 || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %q %v", response.Code, response.Body, response.Header())
	}
	if records := w.workspace.Lists[0].Records; len(records) != 2 || *records[1].ID != "mid" {
		t.Fatalf("records = %+v", records)
	}
	expect(t, send(w, "DELETE", "/api/v1/lists/l1/records/new", ""), 404, `{"error":"recordNotFound"}`)
	expect(t, send(w, "DELETE", "/api/v1/lists/missing/records/mid", ""), 404, `{"error":"listNotFound"}`)
}

func TestRecordWritesNeedWritable(t *testing.T) {
	for _, method := range []string{"PATCH", "DELETE"} {
		response := serveAs(saved(t), "Bearer alice", method, "/api/v1/lists/l1/records/mid")
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if response.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("%s: Allow = %q", method, response.Header().Get("Allow"))
		}
	}
}

func TestCopyList(t *testing.T) {
	w := writable(t)
	// The copy goes in its source's pack.
	response := sendAs(w, "Bearer alice", "POST", "/api/v1/lists/l1/copy", "", "")
	got := body(t, response)
	if response.Code != 201 || !uuid.MatchString(got) || !strings.Contains(got, `"name":"英単語（コピー）","packId":"pack-l1","category":null,"tags":[],"levels":[],"wordCount":2,"recordCount":0`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	if response := send(w, "POST", "/api/v1/lists/l1/copy", `{"name":"x"}`); response.Code != 201 || !strings.Contains(body(t, response), `"name":"x"`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	expect(t, sendAs(w, "Bearer alice", "POST", "/api/v1/lists/l1/copy", "text/plain", `{"name":"y"}`), 415, `{"error":"unsupportedContentType"}`)
	expect(t, send(w, "POST", "/api/v1/lists/missing/copy", ""), 404, `{"error":"listNotFound"}`)
	if len(w.workspace.Lists) != 4 {
		t.Fatalf("lists = %d", len(w.workspace.Lists))
	}
}

func TestCopyListAllow(t *testing.T) {
	response := send(writable(t), "GET", "/api/v1/lists/l1/copy", "")
	expect(t, response, 405, `{"error":"methodNotAllowed"}`)
	if response.Header().Get("Allow") != "POST" {
		t.Fatalf("Allow = %q", response.Header().Get("Allow"))
	}
	readOnly := serveAs(saved(t), "Bearer alice", "POST", "/api/v1/lists/l1/copy")
	expect(t, readOnly, 405, `{"error":"methodNotAllowed"}`)
	if allow, ok := readOnly.Header()["Allow"]; !ok || allow[0] != "" {
		t.Fatalf("Allow = %q", allow)
	}
}

func TestImportList(t *testing.T) {
	w := writable(t)
	csv := "input,display,annotation\r\nneko,猫,cat\r\n"
	response := sendAs(w, "Bearer alice", "POST", "/api/v1/lists/import?name=%E5%8B%95%E7%89%A9&format=csv", "text/csv; charset=utf-8", csv)
	got := body(t, response)
	if response.Code != 201 || !uuid.MatchString(got) || !strings.Contains(got, `"name":"動物","packId":"pack-`+w.workspace.Lists[2].ID+`","category":null,"tags":[],"levels":[],"wordCount":1,"recordCount":0`) ||
		!strings.Contains(got, `"words":[{"display":"猫","input":"neko","annotation":"cat"}]`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	for _, c := range []struct{ query, contentType, body string }{
		{"name=b&format=tsv", "text/tab-separated-values", "input\tdisplay\nx\ty\n"},
		{"name=c&format=csv", "text/plain", csv},
	} {
		if response := sendAs(w, "Bearer alice", "POST", "/api/v1/lists/import?"+c.query, c.contentType, c.body); response.Code != 201 {
			t.Fatalf("%s: %d %s", c.query, response.Code, response.Body)
		}
	}
	if len(w.workspace.Lists) != 5 {
		t.Fatalf("lists = %d", len(w.workspace.Lists))
	}
}

func TestImportErrors(t *testing.T) {
	csv := "input,display\nx,y\n"
	cases := []struct {
		name, query, contentType, body string
		status                         int
		want                           string
	}{
		{"no name", "format=csv", "text/csv", csv, 400, `{"error":"listNameRequired"}`},
		{"duplicate name", "name=%E8%8B%B1%E5%8D%98%E8%AA%9E&format=csv", "text/csv", csv, 400, `{"error":"listNameDuplicate"}`},
		{"no format", "name=a", "text/csv", csv, 400, `{"error":"invalidQuery"}`},
		{"bad format", "name=a&format=xls", "text/csv", csv, 400, `{"error":"invalidQuery"}`},
		{"json", "name=a&format=csv", "application/json", csv, 415, `{"error":"unsupportedContentType"}`},
		{"too large", "name=a&format=csv", "text/csv", strings.Repeat("a", workspace.MaxImportBytes+1), 413, `{"error":"importTooLarge"}`},
		{"quote", "name=a&format=csv", "text/csv", "input,display\n\"a,b", 400, `{"error":"importQuote","line":2}`},
		{"column count", "name=a&format=csv", "text/csv", "input,display\nx,y\nz", 400, `{"error":"importColumnCount","line":3}`},
		{"header", "name=a&format=csv", "text/csv", "a,b\nx,y", 400, `{"error":"importHeaderRequired"}`},
		// 猫,ねこ saved as Shift_JIS, as Excel saves a CSV in Japanese: the app refuses a file that is not UTF-8.
		{"not utf-8", "name=a&format=csv", "text/csv", "input,display\n\x94\x4c,\x82\xcb\x82\xb1\n", 400, `{"error":"importFileEncoding"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := writable(t)
			expect(t, sendAs(w, "Bearer alice", "POST", "/api/v1/lists/import?"+c.query, c.contentType, c.body), c.status, c.want)
			if len(w.workspace.Lists) != 2 {
				t.Fatalf("lists = %d", len(w.workspace.Lists))
			}
		})
	}
	expect(t, serveAs(saved(t), "Bearer alice", "POST", "/api/v1/lists/import?name=a&format=csv"), 405, `{"error":"methodNotAllowed"}`)
}

func TestExportCSV(t *testing.T) {
	response := serve(t, "GET", "/api/v1/lists/l1/words.csv")
	want := workspace.EncodeWordCSV([]workspace.Word{{Input: "apple", Display: "apple", Annotation: "りんご"}, {Input: "pear", Display: "pear"}})
	if response.Code != 200 || response.Body.String() != want {
		t.Fatalf("%d %q", response.Code, response.Body)
	}
	header := response.Header()
	if header.Get("Content-Type") != "text/csv; charset=utf-8" || header.Get("Cache-Control") != "no-store" ||
		header.Get("Content-Disposition") != `attachment; filename="___.csv"; filename*=UTF-8''%E8%8B%B1%E5%8D%98%E8%AA%9E.csv` {
		t.Fatalf("headers = %v", header)
	}
	if response := serve(t, "HEAD", "/api/v1/lists/l1/words.csv"); response.Code != 200 {
		t.Fatalf("HEAD = %d", response.Code)
	}
	expect(t, serve(t, "GET", "/api/v1/lists/missing/words.csv"), 404, `{"error":"listNotFound"}`)
}

// followedWriter has the followed official pack f, kept equal to the catalog when it is read, and the pack q of its own.
func followedWriter(t *testing.T) (*writer, workspace.OfficialPack) {
	t.Helper()
	official, err := workspace.OfficialPacks()
	if err != nil {
		t.Fatal(err)
	}
	first := official[0]
	packs := `[{"id":"f","name":"公式","origin":{"catalogId":"` + first.CatalogID + `","version":1,"followed":true},"createdAt":"2026-10-01T00:00:00.000Z"},
	  {"id":"q","name":"Mine","createdAt":"2026-10-01T00:00:00.000Z"}]`
	lists := `[{"id":"fl","name":"x","packId":"f","origin":{"listId":"` + first.Lists[0].ID + `"},"createdAt":"2026-10-01T00:00:00.000Z",
	    "words":[{"display":"a","input":"a","annotation":""}],"records":[]},
	  {"id":"g","name":"G","packId":"q","createdAt":"2026-10-01T00:00:00.000Z","words":[{"display":"g","input":"g","annotation":""}],"records":[]}]`
	ws, err := workspace.Decode([]byte(lists), []byte(`[]`), []byte(packs))
	if err != nil {
		t.Fatal(err)
	}
	return &writer{t: t, workspace: ws}, first
}

func TestFollowedPacksRefuseEdits(t *testing.T) {
	w, first := followedWriter(t)
	before := len(w.workspace.Lists)
	words := `"words":[{"display":"a","input":"a"}]`
	for _, request := range [][3]string{
		{"PATCH", "/api/v1/packs/f", `{"name":"New"}`},
		{"PATCH", "/api/v1/packs/f", `{"listOrder":["fl"]}`},
		{"PATCH", "/api/v1/lists/fl", `{"name":"New"}`},
		{"PATCH", "/api/v1/lists/g", `{"packId":"f"}`},
		{"DELETE", "/api/v1/lists/fl", ``},
		{"POST", "/api/v1/lists/fl/copy", ``},
		{"POST", "/api/v1/lists", `{"name":"New","packId":"f",` + words + `}`},
	} {
		expect(t, send(w, request[0], request[1], request[2]), 409, `{"error":"packFollowed"}`)
	}
	expect(t, sendAs(w, "Bearer alice", "POST", "/api/v1/lists/import?name=New&format=csv&packId=f", "text/csv", "input,display\na,a\n"),
		409, `{"error":"packFollowed"}`)
	if len(w.workspace.Lists) != before || w.workspace.Packs[0].Name != "公式" {
		t.Fatalf("workspace changed: %+v", w.workspace)
	}
	// The pack and its lists show where they come from.
	got := body(t, send(w, "GET", "/api/v1/packs/f", ""))
	if !strings.Contains(got, `"origin":{"catalogId":"`+first.CatalogID+`","version":1,"followed":true}`) ||
		!strings.Contains(got, `"id":"fl","name":"`+first.Lists[0].Name+`"`) || !strings.Contains(got, `"origin":{"listId":"`+first.Lists[0].ID+`"}`) {
		t.Fatalf("pack = %s", got)
	}
	// Records are added to a followed pack's lists.
	run := `{"id":"r1","time":3,"date":"2026-10-12T00:00:00Z","mistakes":0,"accuracy":100}`
	if response := send(w, "POST", "/api/v1/lists/fl/records", run); response.Code != 201 {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	// A copy is a pack of the account's own, without origins.
	response := send(w, "POST", "/api/v1/packs/f/copy", "")
	got = body(t, response)
	if response.Code != 201 || !strings.Contains(got, `"name":"公式（コピー）"`) || strings.Contains(got, `"origin":{`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	// Deleting the pack stops following it.
	if response := send(w, "DELETE", "/api/v1/packs/f", ""); response.Code != 204 {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	if slices.ContainsFunc(w.workspace.Packs, func(pack workspace.Pack) bool { return pack.ID == "f" }) {
		t.Fatalf("packs = %+v", w.workspace.Packs)
	}
}
