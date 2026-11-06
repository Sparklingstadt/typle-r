package workspace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
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
	return normalizedOnly(t, f.Library.Lists, []byte("[]"), f.Library.Packs)
}

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

// Only the mark of a list in a file is checked: absent or null reads as left out, any other shape is unreadable.
func TestPackFileWriting(t *testing.T) {
	list := func(writing string) string {
		return `[{"name":"n","writing":` + writing + `,"words":[{"display":"a","input":"a","annotation":""}]}]`
	}
	file, err := DecodePackFile([]byte(packFileText(list(`{"language":"zh-Hant"}`), `{"name":"p"}`)))
	if err != nil || file.Lists[0].Writing == nil || file.Lists[0].Writing.Language != "zh-Hant" {
		t.Fatalf("file = %+v, err = %v", file, err)
	}
	if file, err = DecodePackFile([]byte(packFileText(list(`null`), `{"name":"p"}`))); err != nil || file.Lists[0].Writing != nil {
		t.Fatalf("null: %+v, %v", file, err)
	}
	for _, bad := range []string{`{"language":"xx"}`, `{"language":"ja","x":1}`, `{}`, `"ja"`, `[]`, `{"language":null}`} {
		_, err := DecodePackFile([]byte(packFileText(list(bad), `{"name":"p"}`)))
		wantKey(t, err, "packFileUnreadable")
	}
}
