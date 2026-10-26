package api

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// savedPackLists and savedPacks are Linux (p), with 基本 and 応用 at two levels, around Go (q) with its list Go.
const (
	savedPackLists = `[{"id":"a","name":"基本","packId":"p","levels":["基本"],"createdAt":"2026-10-10T00:00:00.000Z",
	    "words":[{"display":"ls","input":"ls","annotation":""}],
	    "records":[{"time":5,"date":"2026-10-05T00:00:00.000Z"},{"time":4,"date":"2026-10-04T00:00:00.000Z"}]},
	  {"id":"g","name":"Go","packId":"q","createdAt":"2026-10-11T00:00:00.000Z","words":[{"display":"go","input":"go","annotation":""}],"records":[]},
	  {"id":"b","name":"応用","packId":"p","levels":["応用"],"createdAt":"2026-10-12T00:00:00.000Z",
	    "words":[{"display":"grep","input":"grep","annotation":""},{"display":"sed","input":"sed","annotation":""}],"records":[]}]`
	savedPacks = `[{"id":"p","name":"Linux","description":"シェルの基本","category":"プログラミング","tags":["シェル"],
	    "origin":{"catalogId":"pack-x","version":1},"createdAt":"2026-10-10T00:00:00.000Z"},
	  {"id":"q","name":"Go","createdAt":"2026-10-11T00:00:00.000Z"}]`

	linuxSummary = `{"id":"p","name":"Linux","description":"シェルの基本","category":"プログラミング","tags":["シェル"],
	  "origin":{"catalogId":"pack-x","version":1},"createdAt":"2026-10-10T00:00:00.000Z","listCount":2,"wordCount":3,"practiceCount":2,
	  "practicedListCount":1,"lastPracticed":"2026-10-05T00:00:00.000Z"}`
	goSummary = `{"id":"q","name":"Go","description":null,"category":null,"tags":[],"origin":null,"createdAt":"2026-10-11T00:00:00.000Z",
	  "listCount":1,"wordCount":1,"practiceCount":0,"practicedListCount":0,"lastPracticed":null}`
	basicSummary = `{"id":"a","name":"基本","packId":"p","category":"プログラミング","tags":["シェル"],"levels":["基本"],"wordCount":1,"recordCount":2,
	  "createdAt":"2026-10-10T00:00:00.000Z","practiceCount":2,"lastPracticed":"2026-10-05T00:00:00.000Z","currentRecordCount":0}`
	advancedSummary = `{"id":"b","name":"応用","packId":"p","category":"プログラミング","tags":["シェル"],"levels":["応用"],"wordCount":2,"recordCount":0,
	  "createdAt":"2026-10-12T00:00:00.000Z","practiceCount":0,"lastPracticed":null,"currentRecordCount":0}`
	goListSummary = `{"id":"g","name":"Go","packId":"q","category":null,"tags":[],"levels":[],"wordCount":1,"recordCount":0,
	  "createdAt":"2026-10-11T00:00:00.000Z","practiceCount":0,"lastPracticed":null,"currentRecordCount":0}`
)

func packLibrary(t *testing.T) *workspace.Workspace {
	t.Helper()
	w, err := workspace.Decode([]byte(savedPackLists), []byte(`[]`), []byte(savedPacks))
	if err != nil {
		t.Fatal(err)
	}
	return w
}

// detailOf is a pack summary with its lists.
func detailOf(summary string, lists ...string) string {
	return strings.TrimSuffix(strings.TrimSpace(summary), `}`) + `,"lists":[` + strings.Join(lists, ",") + `]}`
}

func packWriter(t *testing.T) *writer {
	return &writer{t: t, workspace: packLibrary(t)}
}

func TestPacks(t *testing.T) {
	s := &source{workspace: packLibrary(t)}
	expect(t, serveFrom(s, "GET", "/api/v1/packs"), 200, `{"packs":[`+linuxSummary+`,`+goSummary+`]}`)
	for query, want := range map[string]string{
		// category (empty for the packs without one) and every tag, ignoring case.
		"category=%E3%83%97%E3%83%AD%E3%82%B0%E3%83%A9%E3%83%9F%E3%83%B3%E3%82%B0": linuxSummary,
		"category=":                             goSummary,
		"tag=%E3%82%B7%E3%82%A7%E3%83%AB":       linuxSummary,
		"tag=%E3%82%B7%E3%82%A7%E3%83%AB&tag=x": "",
		// q finds the pack name, and the names and words of the lists inside.
		"q=LINUX":              linuxSummary,
		"q=%E5%BF%9C%E7%94%A8": linuxSummary,
		"q=SED":                linuxSummary,
		"q=go":                 goSummary,
		"q=none":               "",
	} {
		t.Run(query, func(t *testing.T) {
			expect(t, serveFrom(s, "GET", "/api/v1/packs?"+query), 200, `{"packs":[`+want+`]}`)
		})
	}
}

func TestPack(t *testing.T) {
	s := &source{workspace: packLibrary(t)}
	expect(t, serveFrom(s, "GET", "/api/v1/packs/p"), 200, `{"pack":`+detailOf(linuxSummary, basicSummary, advancedSummary)+`}`)
	expect(t, serveFrom(s, "GET", "/api/v1/packs/q"), 200, `{"pack":`+detailOf(goSummary, goListSummary)+`}`)
	expect(t, serveFrom(s, "GET", "/api/v1/packs/missing"), 404, `{"error":"packNotFound"}`)
	// The lists show their levels too.
	expect(t, serveFrom(s, "GET", "/api/v1/lists"), 200, `{"lists":[`+basicSummary+`,`+goListSummary+`,`+advancedSummary+`]}`)
}

func TestExportPack(t *testing.T) {
	w := packLibrary(t)
	s := &source{workspace: w}
	response := serveFrom(s, "GET", "/api/v1/packs/p/export")
	want, err := workspace.EncodePackFile(w, "p")
	if err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || response.Body.String() != string(want) {
		t.Fatalf("%d %q", response.Code, response.Body)
	}
	header := response.Header()
	if header.Get("Content-Type") != "application/json; charset=utf-8" || header.Get("Cache-Control") != "no-store" ||
		header.Get("X-Content-Type-Options") != "nosniff" ||
		header.Get("Content-Disposition") != `attachment; filename="Linux.typle-pack.json"; filename*=UTF-8''Linux.typle-pack.json` {
		t.Fatalf("headers = %v", header)
	}
	w.Packs[1].Name = "Go/言語"
	if got := serveFrom(s, "GET", "/api/v1/packs/q/export").Header().Get("Content-Disposition"); got !=
		`attachment; filename="Go___.typle-pack.json"; filename*=UTF-8''Go_%E8%A8%80%E8%AA%9E.typle-pack.json` {
		t.Fatalf("Content-Disposition = %s", got)
	}
	if response := serveFrom(s, "HEAD", "/api/v1/packs/p/export"); response.Code != 200 {
		t.Fatalf("HEAD = %d", response.Code)
	}
	expect(t, serveFrom(s, "GET", "/api/v1/packs/missing/export"), 404, `{"error":"packNotFound"}`)
}

var packUUID = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`)

// withoutIDs replaces the UUIDs the server made with x, and the creation times it gave with t.
func withoutIDs(text string) string {
	return regexp.MustCompile(`"createdAt":"[^"]+"`).ReplaceAllString(packUUID.ReplaceAllString(text, "x"), `"createdAt":"t"`)
}

func TestCreatePack(t *testing.T) {
	w := packWriter(t)
	response := send(w, "POST", "/api/v1/packs", `{"name":" Rust ","description":" 所有権 ","category":" 言語 ","tags":["rust"," RUST",""],
	  "lists":[{"name":" 入門 ","levels":[" 1 ",""],"words":[{"display":"fn","input":"fn"}]},{"name":"応用","levels":["2"],"words":[{"display":"impl","input":"impl"}]}]}`)
	got := withoutIDs(body(t, response))
	list := func(name, level string) string {
		return `{"id":"x","name":"` + name + `","packId":"x","category":"言語","tags":["rust"],"levels":["` + level + `"],"wordCount":1,"recordCount":0,` +
			`"createdAt":"t","practiceCount":0,"lastPracticed":null,"currentRecordCount":0}`
	}
	want := `{"pack":` + detailOf(`{"id":"x","name":"Rust","description":"所有権","category":"言語","tags":["rust"],"origin":null,"createdAt":"t",
	  "listCount":2,"wordCount":2,"practiceCount":0,"practicedListCount":0,"lastPracticed":null}`, list("入門", "1"), list("応用", "2")) + `}`
	if response.Code != 201 {
		t.Fatalf("%d %s", response.Code, got)
	}
	var gotJSON, wantJSON any
	if json.Unmarshal([]byte(got), &gotJSON) != nil || json.Unmarshal([]byte(want), &wantJSON) != nil {
		t.Fatalf("not JSON: %s", got)
	}
	gotText, _ := json.Marshal(gotJSON)
	wantText, _ := json.Marshal(wantJSON)
	if string(gotText) != string(wantText) {
		t.Fatalf("body = %s\nwant   %s", gotText, wantText)
	}
	if last := w.workspace.Packs[len(w.workspace.Packs)-1]; last.Name != "Rust" || len(w.workspace.Lists) != 5 {
		t.Fatalf("packs = %+v", w.workspace.Packs)
	}
	lists := `"lists":[{"name":"a","words":[{"display":"a","input":"a"}]}]`
	for _, c := range []struct{ body, want string }{
		{`{"name":" ",` + lists + `}`, "packNameRequired"},
		{`{` + lists + `}`, "packNameRequired"},
		{`{"name":"linux",` + lists + `}`, "packNameDuplicate"},
		{`{"name":"N","lists":[]}`, "invalidPack"},
		{`{"name":"N"}`, "invalidPack"},
		{`{"name":"N","description":"` + strings.Repeat("d", 501) + `",` + lists + `}`, "invalidPack"},
		{`{"name":"N","lists":[{"name":"a","words":[{"display":"a","input":"a"}]},{"name":"A","words":[{"display":"a","input":"a"}]}]}`, "listNameDuplicate"},
		{`{"name":"N","lists":[{"name":"a","levels":["x"],"words":[{"display":"a","input":"a"}]},{"name":"b","levels":["x","y"],"words":[{"display":"a","input":"a"}]}]}`, "levelsConflict"},
		{`{"name":"N","lists":[{"name":"a","words":[]}]}`, "wordsRequired"},
		{`{"name":"N","listOrder":[],` + lists + `}`, "invalidJson"},
		{`{"name":"N","lists":[{"name":"a","words":[{"display":"a","input":"a"}],"records":[]}]}`, "invalidJson"},
		{`{"Name":"N",` + lists + `}`, "invalidJson"},
	} {
		t.Run(c.want, func(t *testing.T) {
			w := packWriter(t)
			expect(t, send(w, "POST", "/api/v1/packs", c.body), 400, `{"error":"`+c.want+`"}`)
			if len(w.workspace.Packs) != 2 || len(w.workspace.Lists) != 3 {
				t.Fatalf("library changed: %+v", w.workspace.Packs)
			}
		})
	}
}

func TestUpdatePack(t *testing.T) {
	w := packWriter(t)
	response := send(w, "PATCH", "/api/v1/packs/p", `{"name":"Shell","description":"","tags":[],"listOrder":["b","zz"]}`)
	want := `{"pack":` + detailOf(strings.NewReplacer(`"name":"Linux","description":"シェルの基本"`, `"name":"Shell","description":null`,
		`"tags":["シェル"]`, `"tags":[]`).Replace(linuxSummary), strings.ReplaceAll(advancedSummary, `"tags":["シェル"]`, `"tags":[]`),
		strings.ReplaceAll(basicSummary, `"tags":["シェル"]`, `"tags":[]`)) + `}`
	expect(t, response, 200, want)
	// The lists keep the places they had among all lists: only the pack's order changes.
	expect(t, send(w, "GET", "/api/v1/lists", ""), 200, `{"lists":[`+strings.ReplaceAll(advancedSummary, `"tags":["シェル"]`, `"tags":[]`)+`,`+
		goListSummary+`,`+strings.ReplaceAll(basicSummary, `"tags":["シェル"]`, `"tags":[]`)+`]}`)
	for _, c := range []struct {
		path, body string
		status     int
		want       string
	}{
		{"/api/v1/packs/p", `{}`, 400, "invalidJson"},
		{"/api/v1/packs/p", `{"name":null}`, 400, "invalidJson"},
		{"/api/v1/packs/p", `{"lists":[]}`, 400, "invalidJson"},
		{"/api/v1/packs/p", `{"name":"GO"}`, 400, "packNameDuplicate"},
		{"/api/v1/packs/p", `{"name":" "}`, 400, "packNameRequired"},
		{"/api/v1/packs/p", `{"category":"` + strings.Repeat("c", 51) + `"}`, 400, "invalidPack"},
		{"/api/v1/packs/missing", `{"name":"a"}`, 404, "packNotFound"},
	} {
		t.Run(c.body, func(t *testing.T) {
			expect(t, send(packWriter(t), "PATCH", c.path, c.body), c.status, `{"error":"`+c.want+`"}`)
		})
	}
}

func TestDeletePack(t *testing.T) {
	w := packWriter(t)
	response := send(w, "DELETE", "/api/v1/packs/p", "")
	if response.Code != 204 || response.Body.Len() != 0 || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %q %v", response.Code, response.Body, response.Header())
	}
	expect(t, send(w, "GET", "/api/v1/packs", ""), 200, `{"packs":[`+goSummary+`]}`)
	expect(t, send(w, "GET", "/api/v1/lists", ""), 200, `{"lists":[`+goListSummary+`]}`)
	expect(t, send(w, "DELETE", "/api/v1/packs/p", ""), 404, `{"error":"packNotFound"}`)
}

func TestCopyPack(t *testing.T) {
	w := packWriter(t)
	response := sendAs(w, "Bearer alice", "POST", "/api/v1/packs/p/copy", "", "")
	got := body(t, response)
	if response.Code != 201 || !strings.Contains(got, `"name":"Linux（コピー）","description":"シェルの基本","category":"プログラミング","tags":["シェル"],"origin":null`) ||
		!strings.Contains(got, `"listCount":2,"wordCount":3,"practiceCount":0,"practicedListCount":0,"lastPracticed":null`) ||
		!strings.Contains(got, `"name":"基本","packId":"`) || !strings.Contains(got, `"levels":["応用"]`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	// The copy goes right after its source.
	if names := []string{w.workspace.Packs[0].Name, w.workspace.Packs[1].Name, w.workspace.Packs[2].Name}; strings.Join(names, ",") != "Linux,Linux（コピー）,Go" {
		t.Fatalf("packs = %v", names)
	}
	if response := send(w, "POST", "/api/v1/packs/p/copy", `{"name":" Shell "}`); response.Code != 201 || !strings.Contains(body(t, response), `"name":"Shell"`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	expect(t, send(w, "POST", "/api/v1/packs/p/copy", `{"name":"go"}`), 400, `{"error":"packNameDuplicate"}`)
	expect(t, send(w, "POST", "/api/v1/packs/p/copy", `{"title":"a"}`), 400, `{"error":"invalidJson"}`)
	expect(t, sendAs(w, "Bearer alice", "POST", "/api/v1/packs/p/copy", "text/plain", `{"name":"y"}`), 415, `{"error":"unsupportedContentType"}`)
	expect(t, send(w, "POST", "/api/v1/packs/missing/copy", ""), 404, `{"error":"packNotFound"}`)
	if len(w.workspace.Packs) != 4 || len(w.workspace.Lists) != 7 {
		t.Fatalf("packs = %d, lists = %d", len(w.workspace.Packs), len(w.workspace.Lists))
	}
}

func TestImportPack(t *testing.T) {
	w := packWriter(t)
	file, err := workspace.EncodePackFile(w.workspace, "p")
	if err != nil {
		t.Fatal(err)
	}
	response := sendAs(w, "Bearer alice", "POST", "/api/v1/packs/import", "application/json", "\uFEFF"+string(file))
	got := body(t, response)
	if response.Code != 201 || !strings.Contains(got, `"name":"Linux（2）","description":"シェルの基本","category":"プログラミング","tags":["シェル"],"origin":null`) ||
		!strings.Contains(got, `"listCount":2,"wordCount":3,"practiceCount":0`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	if last := w.workspace.Packs[len(w.workspace.Packs)-1]; last.Name != "Linux（2）" {
		t.Fatalf("packs = %+v", w.workspace.Packs)
	}
	// The file the pack exports is the one it was imported from.
	imported := w.workspace.Packs[len(w.workspace.Packs)-1].ID
	exported := send(w, "GET", "/api/v1/packs/"+imported+"/export", "")
	if exported.Body.String() != strings.Replace(string(file), `"name": "Linux"`, `"name": "Linux（2）"`, 1) {
		t.Fatalf("export = %s", exported.Body)
	}
	for _, c := range []struct {
		name, contentType, body string
		status                  int
		want                    string
	}{
		{"not json", "application/json", "{", 400, "packFileUnreadable"},
		{"empty", "application/json", "", 400, "packFileUnreadable"},
		{"other format", "application/json", `{"format":"x","version":1,"pack":{"name":"a"},"lists":[]}`, 400, "packFileUnreadable"},
		{"no name", "application/json", `{"format":"typle-pack","version":1,"pack":{"name":" "},"lists":[{"name":"a","words":[{"display":"a","input":"a","annotation":""}]}]}`, 400, "packNameRequired"},
		{"bad words", "application/json", `{"format":"typle-pack","version":1,"pack":{"name":"a"},"lists":[{"name":"a","words":[]}]}`, 400, "wordsRequired"},
		{"text", "text/plain", string(file), 415, "unsupportedContentType"},
		{"too large", "application/json", strings.Repeat(" ", workspace.MaxImportBytes+1), 413, "importTooLarge"},
	} {
		t.Run(c.name, func(t *testing.T) {
			w := packWriter(t)
			expect(t, sendAs(w, "Bearer alice", "POST", "/api/v1/packs/import", c.contentType, c.body), c.status, `{"error":"`+c.want+`"}`)
			if len(w.workspace.Packs) != 2 {
				t.Fatalf("packs = %d", len(w.workspace.Packs))
			}
		})
	}
}

func TestPackWritesNeedWritable(t *testing.T) {
	for _, c := range []struct{ method, path, allow string }{
		{"POST", "/api/v1/packs", "GET, HEAD"},
		{"PATCH", "/api/v1/packs/p", "GET, HEAD"},
		{"DELETE", "/api/v1/packs/p", "GET, HEAD"},
		{"POST", "/api/v1/packs/p/copy", ""},
		{"POST", "/api/v1/packs/import", ""},
		{"POST", "/api/v1/packs/p/export", "GET, HEAD"},
	} {
		s := &source{workspace: packLibrary(t)}
		response := serveAs(s, "Bearer alice", c.method, c.path)
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if allow, ok := response.Header()["Allow"]; !ok || allow[0] != c.allow || len(s.owners) != 0 {
			t.Fatalf("%s %s: Allow = %q", c.method, c.path, allow)
		}
	}
	allowed := map[string]string{
		"/api/v1/packs":          "GET, HEAD, POST",
		"/api/v1/packs/p":        "GET, HEAD, PATCH, DELETE",
		"/api/v1/packs/p/copy":   "POST",
		"/api/v1/packs/import":   "POST",
		"/api/v1/packs/p/export": "GET, HEAD",
	}
	for path, allow := range allowed {
		w := packWriter(t)
		response := send(w, "PUT", path, `{}`)
		expect(t, response, 405, `{"error":"methodNotAllowed"}`)
		if response.Header().Get("Allow") != allow || len(w.owners) != 0 {
			t.Fatalf("%s: Allow = %q", path, response.Header().Get("Allow"))
		}
	}
}

// The list API names a list's pack with packId and its levels with levels.
func TestListsInPacks(t *testing.T) {
	w := packWriter(t)
	response := send(w, "POST", "/api/v1/lists", `{"name":"上級","packId":"p","levels":[" 上級 ",""],"words":[{"display":"awk","input":"awk"}]}`)
	got := body(t, response)
	if response.Code != 201 || !strings.Contains(got, `"name":"上級","packId":"p","category":"プログラミング","tags":["シェル"],"levels":["上級"]`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	id := w.workspace.Lists[len(w.workspace.Lists)-1].ID
	expect(t, send(w, "POST", "/api/v1/lists", `{"name":"N","packId":"p","category":"c","words":[{"display":"a","input":"a"}]}`), 400, `{"error":"invalidList"}`)
	expect(t, send(w, "POST", "/api/v1/lists", `{"name":"N","packId":"zz","words":[{"display":"a","input":"a"}]}`), 400, `{"error":"packNotFound"}`)
	expect(t, send(w, "POST", "/api/v1/lists", `{"name":"N","packId":"p","levels":["基本","1"],"words":[{"display":"a","input":"a"}]}`), 400, `{"error":"levelsConflict"}`)
	// A list moves to another pack after its last list, and shows that pack's labels; levels alone may change.
	if response := send(w, "PATCH", "/api/v1/lists/"+id, `{"packId":"q"}`); response.Code != 200 ||
		!strings.Contains(body(t, response), `"name":"上級","packId":"q","category":null,"tags":[],"levels":["上級"]`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	if response := send(w, "PATCH", "/api/v1/lists/"+id, `{"levels":[]}`); response.Code != 200 || !strings.Contains(body(t, response), `"levels":[]`) {
		t.Fatalf("%d %s", response.Code, response.Body)
	}
	expect(t, send(w, "PATCH", "/api/v1/lists/"+id, `{"packId":"zz"}`), 400, `{"error":"packNotFound"}`)
	expect(t, send(w, "PATCH", "/api/v1/lists/b", `{"levels":["基本","x"]}`), 400, `{"error":"levelsConflict"}`)
	// A copy stays in its source's pack, after every list, with no levels.
	response = send(w, "POST", "/api/v1/lists/a/copy", "")
	if got := body(t, response); response.Code != 201 || !strings.Contains(got, `"name":"基本（コピー）","packId":"p","category":"プログラミング","tags":["シェル"],"levels":[],"wordCount":1,"recordCount":0`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	// A list is imported into a pack named by the packId query.
	response = sendAs(w, "Bearer alice", "POST", "/api/v1/lists/import?name=%E5%8F%96%E8%BE%BC&format=csv&packId=p", "text/csv", "input,display\nx,y\n")
	if got := body(t, response); response.Code != 201 || !strings.Contains(got, `"name":"取込","packId":"p","category":"プログラミング"`) {
		t.Fatalf("%d %s", response.Code, got)
	}
	expect(t, sendAs(w, "Bearer alice", "POST", "/api/v1/lists/import?name=a&format=csv&packId=zz", "text/csv", "input,display\nx,y\n"), 400, `{"error":"packNotFound"}`)
	var names []string
	for _, list := range w.workspace.Lists {
		names = append(names, list.PackID+":"+list.Name)
	}
	if strings.Join(names, ",") != "p:基本,q:Go,q:上級,p:応用,p:基本（コピー）,p:取込" {
		t.Fatalf("lists = %v", names)
	}
}
