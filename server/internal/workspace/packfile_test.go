package workspace

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The fixtures are shared with tests/packFile.test.cjs, so Go writes the same bytes as the app's encodePackFile.
type packFileFixture struct {
	Library struct{ Packs, Lists json.RawMessage }
	PackID  string
	File    string
}

func packFileFixtures(t *testing.T) map[string]packFileFixture {
	t.Helper()
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "tests", "fixtures", "pack-file", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatalf("fixtures: %v, %v", files, err)
	}
	fixtures := map[string]packFileFixture{}
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		var fixture packFileFixture
		if err := json.Unmarshal(data, &fixture); err != nil {
			t.Fatal(err)
		}
		fixtures[filepath.Base(file)] = fixture
	}
	return fixtures
}

func (f packFileFixture) workspace(t *testing.T) *Workspace {
	t.Helper()
	w, err := Decode(f.Library.Lists, []byte("[]"), f.Library.Packs)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

var packNow = time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)

func TestEncodePackFileFixtures(t *testing.T) {
	for name, fixture := range packFileFixtures(t) {
		t.Run(name, func(t *testing.T) {
			got, err := EncodePackFile(fixture.workspace(t), fixture.PackID)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != fixture.File {
				t.Fatalf("EncodePackFile =\n%s\nwant\n%s", got, fixture.File)
			}
		})
	}
}

// A file read back and imported encodes to the same file, under a numbered name.
func TestPackFileRoundTrip(t *testing.T) {
	for name, fixture := range packFileFixtures(t) {
		t.Run(name, func(t *testing.T) {
			w := fixture.workspace(t)
			beforeLists, beforePacks := encodeBoth(t, w)
			file, err := DecodePackFile([]byte(fixture.File))
			if err != nil {
				t.Fatal(err)
			}
			ids := make([]string, len(file.Lists))
			for n := range ids {
				ids[n] = fmt.Sprintf("i%d", n)
			}
			pack, err := ImportPack(w, file, "imported", ids, packNow)
			if err != nil {
				t.Fatal(err)
			}
			last := w.Packs[len(w.Packs)-1]
			if pack != &w.Packs[len(w.Packs)-1] || last.ID != "imported" || last.Name != file.Pack.Name+"（2）" ||
				last.CreatedAt != "2026-10-26T00:00:00.000Z" || last.Origin != nil {
				t.Fatalf("pack = %+v", last)
			}
			added := w.Lists[len(w.Lists)-len(ids):]
			for n, list := range added {
				if list.ID != ids[n] || list.PackID != "imported" || len(list.Records) != 0 || list.Records == nil ||
					list.CreatedAt != "2026-10-26T00:00:00.000Z" {
					t.Fatalf("list %d = %+v", n, list)
				}
			}
			original, err := marshal(file.Pack.Name)
			if err != nil {
				t.Fatal(err)
			}
			renamed, err := marshal(last.Name)
			if err != nil {
				t.Fatal(err)
			}
			want := strings.Replace(fixture.File, `"name": `+string(original), `"name": `+string(renamed), 1)
			got, err := EncodePackFile(w, "imported")
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != want {
				t.Fatalf("EncodePackFile =\n%s\nwant\n%s", got, want)
			}
			// What was there stays as it was.
			kept := &Workspace{Lists: w.Lists[:len(w.Lists)-len(ids)], Packs: w.Packs[:len(w.Packs)-1]}
			afterLists, afterPacks := encodeBoth(t, kept)
			if string(afterLists) != string(beforeLists) || string(afterPacks) != string(beforePacks) {
				t.Fatalf("library changed:\n%s\n%s", afterLists, afterPacks)
			}
			lists, packs := encodeBoth(t, w)
			if err := CheckPacks(w.Packs, stored(t, lists)); err != nil {
				t.Fatalf("CheckPacks: %v (%s)", err, packs)
			}
		})
	}
}

func packFileText(lists string, pack string) string {
	return `{"format":"typle-pack","version":1,"pack":` + pack + `,"lists":` + lists + `}`
}

// A file kept as jsonb comes back with other spacing and key order; Encode writes it again as it was written.
func TestPackFileEncodeAgain(t *testing.T) {
	for name, fixture := range packFileFixtures(t) {
		t.Run(name, func(t *testing.T) {
			var reordered any
			if err := json.Unmarshal([]byte(fixture.File), &reordered); err != nil {
				t.Fatal(err)
			}
			compact, err := json.Marshal(reordered)
			if err != nil {
				t.Fatal(err)
			}
			file, err := DecodePackFile(compact)
			if err != nil {
				t.Fatal(err)
			}
			got, err := file.Encode()
			if err != nil || string(got) != fixture.File {
				t.Fatalf("Encode =\n%s, %v\nwant\n%s", got, err, fixture.File)
			}
		})
	}
}

func TestEncodePackFileLeavesOutEmptyFields(t *testing.T) {
	w := &Workspace{
		Packs: []Pack{{ID: "q", Name: "Go", Description: "", Category: "", Tags: []string{}, CreatedAt: packStamp}},
		Lists: []List{{ID: "g", Name: "Go", PackID: "q", Levels: []string{}, Words: []Word{{Display: "go", Input: "go", Extra: `{"x":1}`}},
			Records: []Record{}, CreatedAt: packStamp, Extra: `{"y":2}`}},
	}
	got, err := EncodePackFile(w, "q")
	if err != nil {
		t.Fatal(err)
	}
	want := "{\n  \"format\": \"typle-pack\",\n  \"version\": 1,\n  \"pack\": {\n    \"name\": \"Go\"\n  },\n  \"lists\": [\n    {\n" +
		"      \"name\": \"Go\",\n      \"words\": [\n        {\n          \"display\": \"go\",\n          \"input\": \"go\",\n" +
		"          \"annotation\": \"\"\n        }\n      ]\n    }\n  ]\n}\n"
	if string(got) != want {
		t.Fatalf("EncodePackFile =\n%s\nwant\n%s", got, want)
	}
	_, err = EncodePackFile(w, "missing")
	wantKey(t, err, "packNotFound")
}

// Strings are escaped as JSON.stringify escapes them (node -e 'console.log(JSON.stringify(...))').
func TestEncodePackFileEscapesAsJavaScript(t *testing.T) {
	w := &Workspace{
		Packs: []Pack{{ID: "q", Name: "<&>  \\u2028\\ \b\f\x01\x7f/", CreatedAt: packStamp}},
		Lists: []List{{ID: "g", Name: "a", PackID: "q", Words: []Word{{Display: "a", Input: "a"}}, Records: []Record{}, CreatedAt: packStamp}},
	}
	got, err := EncodePackFile(w, "q")
	if err != nil {
		t.Fatal(err)
	}
	want := `"name": "<&>` + "  " + `\\u2028\\` + " " + `\b\f\u0001` + "\x7f" + `/"`
	if !strings.Contains(string(got), want) {
		t.Fatalf("EncodePackFile =\n%s\nwant %s", got, want)
	}
}

func TestDecodePackFileKeepsKnownFields(t *testing.T) {
	text := `{"format":"typle-pack","version":1,"id":"y","pack":{"name":"P","description":null,"category":"c","tags":["t"],"id":"x"},` +
		`"lists":[{"name":"L","levels":null,"extra":1,"words":[{"display":"A","input":"a","annotation":"n","more":2}]}]}`
	file, err := DecodePackFile([]byte(text))
	if err != nil {
		t.Fatal(err)
	}
	want := &PackFile{Format: "typle-pack", Version: 1, Pack: PackFileInfo{Name: "P", Category: "c", Tags: []string{"t"}},
		Lists: []PackFileList{{Name: "L", Words: []Word{{Display: "A", Input: "a", Annotation: "n"}}}}}
	if !reflect.DeepEqual(file, want) {
		t.Fatalf("file = %+v\nwant %+v", file, want)
	}
	// 1.0 is the number 1, as JSON.parse reads it.
	if _, err := DecodePackFile([]byte(strings.Replace(text, `"version":1`, `"version":1.0`, 1))); err != nil {
		t.Fatal(err)
	}
}

func TestDecodePackFileRefusesWhatIsNotAPackFile(t *testing.T) {
	good := `[{"name":"L","words":[{"display":"a","input":"a","annotation":""}]}]`
	pack := `{"name":"Imported"}`
	bad := []string{
		"not json", "null", "[]", `"text"`, "",
		`{"format":"typle-list","version":1,"pack":` + pack + `,"lists":` + good + `}`,
		`{"version":1,"pack":` + pack + `,"lists":` + good + `}`,
		`{"format":"typle-pack","version":2,"pack":` + pack + `,"lists":` + good + `}`,
		`{"format":"typle-pack","version":"1","pack":` + pack + `,"lists":` + good + `}`,
		`{"format":"typle-pack","pack":` + pack + `,"lists":` + good + `}`,
		packFileText(good, `null`),
		packFileText(good, `[]`),
		packFileText(good, `{"name":1}`),
		packFileText(good, `{"name":null}`),
		packFileText(good, `{"description":"d"}`),
		packFileText(good, `{"name":"P","tags":"t"}`),
		packFileText(good, `{"name":"P","tags":[1]}`),
		packFileText(good, `{"name":"P","tags":[null]}`),
		packFileText(good, `{"name":"P","description":1}`),
		packFileText(good, `{"name":"P","category":[]}`),
		packFileText(`{}`, pack),
		packFileText(`[]`, pack),
		packFileText(`null`, pack),
		packFileText(`[null]`, pack),
		packFileText(`[{"name":"L"}]`, pack),
		packFileText(`[{"name":"L","words":{}}]`, pack),
		packFileText(`[{"name":1,"words":[]}]`, pack),
		packFileText(`[{"name":"L","levels":"x","words":[{"display":"a","input":"a","annotation":""}]}]`, pack),
		packFileText(`[{"name":"L","levels":[1],"words":[{"display":"a","input":"a","annotation":""}]}]`, pack),
		packFileText(`[{"name":"L","words":[{"display":1,"input":"a","annotation":""}]}]`, pack),
		packFileText(`[{"name":"L","words":[{"display":"a","input":"a"}]}]`, pack),
		packFileText(`[{"name":"L","words":[{"display":"a","input":"a","annotation":null}]}]`, pack),
		packFileText(`[{"name":"L","words":[null]}]`, pack),
		packFileText(good, pack) + "x",
	}
	for _, text := range bad {
		_, err := DecodePackFile([]byte(text))
		wantKey(t, err, "packFileUnreadable")
	}
	if _, err := DecodePackFile([]byte(packFileText(good, pack))); err != nil {
		t.Fatal(err)
	}
}
