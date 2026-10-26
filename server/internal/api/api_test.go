package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sparklingstadt/typle-r/server/internal/auth"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

const savedLists = `[{
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
  }]`

const savedDevices = `[{ "id": "d1", "name": "自宅", "layout": "JIS" }]`

// source has github:1's saved workspace; every other account has saved nothing.
type source struct {
	workspace *workspace.Workspace
	err       error
	owners    []string
}

func (s *source) Read(_ context.Context, owner string) (*workspace.Workspace, error) {
	s.owners = append(s.owners, owner)
	if s.err != nil || owner == "github:1" {
		return s.workspace, s.err
	}
	return &workspace.Workspace{Lists: []workspace.List{}, Devices: []workspace.Device{}}, nil
}

// verifier knows alice (github:1) and bob (github:2). GitHub is down for the token "down".
type verifier struct{}

func (verifier) Owner(_ context.Context, token string) (string, error) {
	switch token {
	case "alice":
		return "github:1", nil
	case "bob":
		return "github:2", nil
	case "down":
		return "", auth.ErrUnavailable
	}
	return "", auth.ErrInvalidToken
}

func saved(t *testing.T) *source {
	t.Helper()
	w, err := workspace.Decode([]byte(savedLists), []byte(savedDevices), nil)
	if err != nil {
		t.Fatal(err)
	}
	return &source{workspace: w}
}

// serve requests as alice.
func serve(t *testing.T, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	return serveAs(saved(t), "Bearer alice", method, target)
}

func serveFrom(s *source, method, target string) *httptest.ResponseRecorder {
	return serveAs(s, "Bearer alice", method, target)
}

func serveAs(s *source, authorization, method, target string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, nil)
	if authorization != "" {
		request.Header.Set("Authorization", authorization)
	}
	response := httptest.NewRecorder()
	New(s, nil, verifier{}).ServeHTTP(response, request)
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
	expect(t, serve(t, "GET", "/api/v1/devices"), 200, `{"devices":[{"id":"d1","name":"自宅","layout":"JIS","practiceCount":1,
	  "lastPracticed":"2026-10-03T00:00:00.000Z"}],"default":{"practiceCount":0,"lastPracticed":null}}`)
}

func TestLists(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/lists"), 200, `{"lists":[`+l1Summary+`,`+l2Summary+`]}`)
}

const (
	l1Summary = `{"id":"l1","name":"英単語","category":null,"tags":[],"wordCount":2,"recordCount":3,"createdAt":"2026-10-10T01:23:45.000Z",
	  "practiceCount":3,"lastPracticed":"2026-10-03T00:00:00.000Z","currentRecordCount":1}`
	l2Summary = `{"id":"l2","name":"空","category":null,"tags":[],"wordCount":1,"recordCount":0,"createdAt":"2026-10-11T00:00:00.000Z",
	  "practiceCount":0,"lastPracticed":null,"currentRecordCount":0}`
)

func TestListsSortAndSearch(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/lists?sort=added"), 200, `{"lists":[`+l2Summary+`,`+l1Summary+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists?sort=practiced"), 200, `{"lists":[`+l1Summary+`,`+l2Summary+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists?sort=words"), 200, `{"lists":[`+l1Summary+`,`+l2Summary+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists?q=PEAR"), 200, `{"lists":[`+l1Summary+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists?q=%E7%A9%BA&sort=name"), 200, `{"lists":[`+l2Summary+`]}`)
	expect(t, serve(t, "GET", "/api/v1/lists?q=none"), 200, `{"lists":[]}`)
	expect(t, serve(t, "GET", "/api/v1/lists?sort=bad"), 400, `{"error":"invalidQuery"}`)
}

func TestList(t *testing.T) {
	expect(t, serve(t, "GET", "/api/v1/lists/l1"), 200, `{"list":{"id":"l1","name":"英単語","category":null,"tags":[],"wordCount":2,"recordCount":3,
	  "createdAt":"2026-10-10T01:23:45.000Z","practiceCount":3,"lastPracticed":"2026-10-03T00:00:00.000Z","currentRecordCount":1,"words":[{"display":"apple","input":"apple","annotation":"りんご"},
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
	for _, path := range []string{"/", "/api/v1", "/api/v1/lists/", "/api/v1/profiles", "/api/workspace", "/api/v1/lists/l1/records/x/y"} {
		expect(t, serve(t, "GET", path), 404, `{"error":"notFound"}`)
	}
	if got := body(t, serve(t, "POST", "/api/v1/lists/l1/records")); got != `{"error":"methodNotAllowed"}` {
		t.Fatalf("POST records = %s", got)
	}
}

func TestDatabaseUnavailable(t *testing.T) {
	failing := &source{err: errors.New("connection refused")}
	for _, path := range []string{"/api/v1/devices", "/api/v1/lists", "/api/v1/lists/l1", "/api/v1/lists/l1/records"} {
		expect(t, serveFrom(failing, "GET", path), 503, `{"error":"databaseUnavailable"}`)
	}
	if len(failing.owners) != 4 {
		t.Fatalf("reads = %v", failing.owners)
	}
}

func TestReadsOnlyForKnownReads(t *testing.T) {
	counting := &source{workspace: &workspace.Workspace{Lists: []workspace.List{}, Devices: []workspace.Device{}}}
	serveFrom(counting, "GET", "/unknown")
	serveFrom(counting, "POST", "/api/v1/lists")
	if len(counting.owners) != 0 {
		t.Fatalf("reads = %v", counting.owners)
	}
}

func TestNeedsToken(t *testing.T) {
	for _, authorization := range []string{"", "Bearer", "Basic YWxpY2U6eA==", "Bearer nobody"} {
		s := saved(t)
		response := serveAs(s, authorization, "GET", "/api/v1/lists")
		expect(t, response, 401, `{"error":"invalidToken"}`)
		if response.Header().Get("WWW-Authenticate") != "Bearer" {
			t.Fatalf("%q: WWW-Authenticate = %q", authorization, response.Header().Get("WWW-Authenticate"))
		}
		if len(s.owners) != 0 {
			t.Fatalf("%q: read %v", authorization, s.owners)
		}
	}
}

func TestEachAccountReadsItsOwnWorkspace(t *testing.T) {
	s := saved(t)
	expect(t, serveAs(s, "Bearer bob", "GET", "/api/v1/lists"), 200, `{"lists":[]}`)
	expect(t, serveAs(s, "bearer bob", "GET", "/api/v1/lists/l1"), 404, `{"error":"listNotFound"}`)
	if got := body(t, serveAs(s, "Bearer alice", "GET", "/api/v1/lists")); !strings.Contains(got, `"id":"l1"`) {
		t.Fatalf("alice = %s", got)
	}
	if strings.Join(s.owners, ",") != "github:2,github:2,github:1" {
		t.Fatalf("owners = %v", s.owners)
	}
}

func TestGitHubUnavailable(t *testing.T) {
	s := saved(t)
	expect(t, serveAs(s, "Bearer down", "GET", "/api/v1/devices"), 503, `{"error":"githubUnavailable"}`)
	if len(s.owners) != 0 {
		t.Fatalf("read %v", s.owners)
	}
}

func TestRecordsFeed(t *testing.T) {
	newest := `{"id":"new","time":4.25,"date":"2026-10-03T00:00:00.000Z","mistakes":0,"accuracy":100,"wordCount":2,
	  "device":{"id":"d1","name":"自宅","layout":"JIS"},"listId":"l1","listName":"英単語","best":true,"day":"2026-10-03"}`
	mid := `{"id":"mid","time":6,"date":"2026-10-02T00:00:00.000Z","listId":"l1","listName":"英単語","best":false,"day":"2026-10-02"}`
	oldest := `{"time":5,"date":"2026-10-01T00:00:00.000Z","listId":"l1","listName":"英単語","best":false,"day":"2026-10-01"}`
	expect(t, serve(t, "GET", "/api/v1/records?tz=UTC"), 200, `{"records":[`+newest+`,`+mid+`,`+oldest+`]}`)
	expect(t, serve(t, "GET", "/api/v1/records?tz=UTC&list=l1&limit=1"), 200, `{"records":[`+newest+`]}`)
	expect(t, serve(t, "GET", "/api/v1/records?tz=UTC&device=d1"), 200, `{"records":[`+newest+`]}`)
	expect(t, serve(t, "GET", "/api/v1/records?tz=UTC&device=none&since=2026-10-01T12:00:00Z"), 200, `{"records":[`+mid+`]}`)
	expect(t, serve(t, "GET", "/api/v1/records?list=l2"), 200, `{"records":[]}`)
	for _, query := range []string{"tz=Mars/Base", "tz=", "limit=0", "since=abc"} {
		expect(t, serve(t, "GET", "/api/v1/records?"+query), 400, `{"error":"invalidQuery"}`)
	}
	// An account with no records answers an empty list.
	expect(t, serveAs(saved(t), "Bearer bob", "GET", "/api/v1/records"), 200, `{"records":[]}`)
}

// The day follows tz: 20:00 UTC on 10 October is 11 October in Tokyo.
func TestRecordsFeedDay(t *testing.T) {
	w, err := workspace.Decode([]byte(`[{"id":"l","name":"a","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],
	  "records":[{"time":1,"date":"2026-10-10T20:00:00.000Z"}]}]`), []byte(`[]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	s := &source{workspace: w}
	for tz, day := range map[string]string{"Asia/Tokyo": "2026-10-11", "UTC": "2026-10-10", "America/New_York": "2026-10-10"} {
		if got := body(t, serveFrom(s, "GET", "/api/v1/records?tz="+tz)); !strings.Contains(got, `"day":"`+day+`"`) {
			t.Errorf("%s: %s", tz, got)
		}
	}
}

func TestRankings(t *testing.T) {
	newest := `{"id":"new","time":4.25,"date":"2026-10-03T00:00:00.000Z","mistakes":0,"accuracy":100,"wordCount":2,"device":{"id":"d1","name":"自宅","layout":"JIS"}}`
	l1 := `{"listId":"l1","listName":"英単語","wordCount":2,"recordCount":3,"best":` + newest + `,"lastPracticed":"2026-10-03T00:00:00.000Z","improved":false}`
	l2 := `{"listId":"l2","listName":"空","wordCount":1,"recordCount":0,"best":null,"lastPracticed":null,"improved":false}`
	expect(t, serve(t, "GET", "/api/v1/rankings"), 200, `{"rankings":[`+l1+`,`+l2+`]}`)
	expect(t, serve(t, "GET", "/api/v1/rankings?sort=name&order=speed"), 200, `{"rankings":[`+l1+`,`+l2+`]}`)
	l1OnD1 := strings.Replace(l1, `"recordCount":3`, `"recordCount":1`, 1)
	expect(t, serve(t, "GET", "/api/v1/rankings?device=d1&sort=count"), 200, `{"rankings":[`+l1OnD1+`,`+l2+`]}`)
	for _, query := range []string{"order=bad", "sort=bad"} {
		expect(t, serve(t, "GET", "/api/v1/rankings?"+query), 400, `{"error":"invalidQuery"}`)
	}
	expect(t, serveAs(saved(t), "Bearer bob", "GET", "/api/v1/rankings"), 200, `{"rankings":[]}`)
}

func TestRanking(t *testing.T) {
	newest := `{"id":"new","time":4.25,"date":"2026-10-03T00:00:00.000Z","mistakes":0,"accuracy":100,"wordCount":2,"device":{"id":"d1","name":"自宅","layout":"JIS"}}`
	mid := `{"id":"mid","time":6,"date":"2026-10-02T00:00:00.000Z"}`
	oldest := `{"time":5,"date":"2026-10-01T00:00:00.000Z"}`
	expect(t, serve(t, "GET", "/api/v1/rankings/l1"), 200, `{"ranking":{"listId":"l1","listName":"英単語","wordCount":2,
	  "ranked":[`+newest+`],"best":`+newest+`,"fallback":false,"otherCounts":[{"wordCount":null,"count":2}],
	  "lastPracticed":"2026-10-03T00:00:00.000Z","improved":false,
	  "stats":{"recentCount":1,"recentTime":4.25,"recentAccuracy":100,"points":[{"date":"2026-10-03T00:00:00.000Z","value":4.25}]}}}`)
	if got := body(t, serve(t, "GET", "/api/v1/rankings/l1?includeOthers=true&order=speed")); !strings.Contains(got, `"ranked":[`+newest+`,`+oldest+`,`+mid+`]`) {
		t.Fatalf("includeOthers = %s", got)
	}
	expect(t, serve(t, "GET", "/api/v1/rankings/l2"), 200, `{"ranking":{"listId":"l2","listName":"空","wordCount":1,"ranked":[],"best":null,
	  "fallback":false,"otherCounts":[],"lastPracticed":null,"improved":false,"stats":{"recentCount":0,"recentTime":null,"recentAccuracy":null,"points":[]}}}`)
	expect(t, serve(t, "GET", "/api/v1/rankings/missing"), 404, `{"error":"listNotFound"}`)
	expect(t, serve(t, "GET", "/api/v1/rankings/l1?includeOthers=yes"), 400, `{"error":"invalidQuery"}`)
}

func TestDashboard(t *testing.T) {
	// Monday 08:30 in Tokyo, still Sunday 23:30 in UTC.
	clock = func() time.Time { return time.Date(2026, 10, 4, 23, 30, 0, 0, time.UTC) }
	t.Cleanup(func() { clock = time.Now })
	newest := `{"id":"new","time":4.25,"date":"2026-10-03T00:00:00.000Z","mistakes":0,"accuracy":100,"wordCount":2,"device":{"id":"d1","name":"自宅","layout":"JIS"}}`
	rest := `"accuracy":{"recent":100,"recentCount":1,"change":null}},
	  "next":[{"listId":"l2","listName":"空","lastPracticed":null,"reason":{"kind":"new"}}],
	  "trends":[{"listId":"l1","listName":"英単語","count":3,"lastPracticed":"2026-10-03T00:00:00.000Z",
	    "speed":{"points":[{"date":"2026-10-03T00:00:00.000Z","value":2.125}],"change":null},
	    "accuracy":{"points":[{"date":"2026-10-03T00:00:00.000Z","value":100}],"change":null},"best":` + newest + `}]}`
	expect(t, serve(t, "GET", "/api/v1/dashboard?tz=Asia/Tokyo"), 200, `{"summary":{"weekStart":"2026-10-04T15:00:00.000Z",
	  "weekCount":0,"previousWeekCount":0,"weekSeconds":0,"previousWeekSeconds":0,"streak":0,"practicedToday":false,`+rest)
	expect(t, serve(t, "GET", "/api/v1/dashboard?tz=UTC"), 200, `{"summary":{"weekStart":"2026-09-28T00:00:00.000Z",
	  "weekCount":3,"previousWeekCount":0,"weekSeconds":15.25,"previousWeekSeconds":0,"streak":3,"practicedToday":false,`+rest)
	for _, query := range []string{"tz=", "tz=Mars/Base"} {
		expect(t, serve(t, "GET", "/api/v1/dashboard?"+query), 400, `{"error":"invalidQuery"}`)
	}
	// An account with nothing saved gets the same shape, empty.
	expect(t, serveAs(saved(t), "Bearer bob", "GET", "/api/v1/dashboard?tz=UTC"), 200, `{"summary":{"weekStart":"2026-09-28T00:00:00.000Z",
	  "weekCount":0,"previousWeekCount":0,"weekSeconds":0,"previousWeekSeconds":0,"streak":0,"practicedToday":false,"accuracy":null},
	  "next":[],"trends":[]}`)
}
