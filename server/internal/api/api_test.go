package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

const data = `{
  "version": 1, "accountId": "guest:local", "revision": 2,
  "lists": [{
    "id": "l1", "name": "英単語", "createdAt": "2026-10-10T01:23:45.000Z", "shared": true,
    "words": [{ "display": "apple", "input": "apple", "annotation": "りんご" }, { "display": "pear", "input": "pear", "annotation": "" }],
    "records": [
      { "time": 5, "date": "2026-10-01T00:00:00.000Z" },
      { "id": "new", "time": 4.25, "date": "2026-10-03T00:00:00.000Z", "mistakes": 0, "accuracy": 100, "wordCount": 2,
        "device": { "id": "d1", "name": "自宅", "layout": "JIS" } },
      { "id": "mid", "time": 6, "date": "2026-10-02T00:00:00.000Z" }
    ]
  }, {
    "id": "l2", "name": "空", "createdAt": "2026-10-11T00:00:00.000Z",
    "words": [{ "display": "a", "input": "a", "annotation": "" }], "records": []
  }],
  "devices": [{ "id": "d1", "name": "自宅", "layout": "JIS" }]
}`

func serve(t *testing.T, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	w, err := workspace.Decode([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	New(w).ServeHTTP(response, httptest.NewRequest(method, target, nil))
	return response
}

func body(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	return strings.TrimSpace(response.Body.String())
}

func expect(t *testing.T, response *httptest.ResponseRecorder, status int, want string) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d: %s", response.Code, status, response.Body)
	}
	var got, expected any
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(want), &expected); err != nil {
		t.Fatal(err)
	}
	gotText, _ := json.Marshal(got)
	wantText, _ := json.Marshal(expected)
	if string(gotText) != string(wantText) {
		t.Fatalf("body = %s\nwant   %s", gotText, wantText)
	}
	if response.Header().Get("Content-Type") != "application/json; charset=utf-8" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %v", response.Header())
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("sent a CORS header")
	}
}

func TestDevices(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/devices"), 200, `{"devices":[{"id":"d1","name":"自宅","layout":"JIS"}]}`)
}

func TestLists(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/lists"), 200, `{"lists":[
	  {"id":"l1","name":"英単語","wordCount":2,"recordCount":3,"createdAt":"2026-10-10T01:23:45.000Z"},
	  {"id":"l2","name":"空","wordCount":1,"recordCount":0,"createdAt":"2026-10-11T00:00:00.000Z"}]}`)
}

func TestList(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/lists/l1"), 200, `{"list":{"id":"l1","name":"英単語","wordCount":2,"recordCount":3,
	  "createdAt":"2026-10-10T01:23:45.000Z","words":[{"display":"apple","input":"apple","annotation":"りんご"},
	  {"display":"pear","input":"pear","annotation":""}]}}`)
	expect(t, serve(t, "GET", "/api/v1/lists/missing"), 404, `{"error":"listNotFound"}`)
}

func TestRecords(t *testing.T) {
	newest := `{"id":"new","time":4.25,"date":"2026-10-03T00:00:00.000Z","mistakes":0,"accuracy":100,"wordCount":2,
	  "device":{"id":"d1","name":"自宅","layout":"JIS"}}`
	mid := `{"id":"mid","time":6,"date":"2026-10-02T00:00:00.000Z"}`
	oldest := `{"time":5,"date":"2026-10-01T00:00:00.000Z"}`
	expect(t, serve(t, "GET", "/api/v1/lists/l1/records"), 200, `{"records":[`+newest+`,`+mid+`,`+oldest+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists/l1/records?limit=1"), 200, `{"records":[`+newest+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists/l1/records?since=2026-10-02T00:00:00Z"), 200, `{"records":[`+newest+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists/l2/records"), 200, `{"records":[]}`)
	expect(t, serve(t, "GET", "/api/v1/lists/missing/records"), 404, `{"error":"listNotFound"}`)
	for _, query := range []string{"limit=0", "limit=1001", "limit=1.5", "limit=+1", "limit=", "since=abc", "since="} {
		expect(t, serve(t, "GET", "/api/v1/lists/l1/records?"+query), 400, `{"error":"invalidQuery"}`)
	}
}

func TestOnlyReads(t *testing.T) {
	for _, method := range []string{"POST", "PATCH", "PUT", "DELETE"} {
		response := serve(t, method, "/api/v1/lists/l1")
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if response.Header().Get("Allow") != "GET, HEAD" {
			t.Fatalf("Allow = %q", response.Header().Get("Allow"))
		}
	}
	if response := serve(t, "HEAD", "/api/v1/lists"); response.Code != http.StatusOK {
		t.Fatalf("HEAD status = %d", response.Code)
	}
}

func TestUnknownPaths(t *testing.T) {
	for _, path := range []string{"/", "/api/v1", "/api/v1/lists/", "/api/v1/profiles", "/api/workspace", "/api/v1/lists/l1/records/x"} {
		expect(t, serve(t, "GET", path), 404, `{"error":"notFound"}`)
	}
	if got := body(t, serve(t, "POST", "/api/v1/lists/l1/records")); got != `{"error":"methodNotAllowed"}` {
		t.Fatalf("POST records = %s", got)
	}
}
