package workspace

import (
	"bytes"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

const lists = `[{
  "id": "l1", "name": " 英単語 ", "createdAt": "2026-10-10T01:23:45.000Z", "shared": true, "shareId": "s",
  "words": [{ "display": "apple", "input": "apple", "annotation": "りんご" }],
  "records": [
    { "time": 5, "date": "2024/09/22 10:05" },
    { "id": "r1", "time": 63.5, "date": "2026-10-10T02:00:00.000Z", "mistakes": 2, "accuracy": 97.5, "wordCount": 1,
      "device": { "id": "d1", "name": "自宅", "layout": "JIS" } }
  ]
}]`

const devices = `[{ "id": "d1", "name": " 自宅 ", "layout": " JIS " }]`

func TestDecodeSavedRow(t *testing.T) {
	w, err := Decode([]byte(lists), []byte(devices), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Lists) != 1 || w.Lists[0].Name != "英単語" || len(w.Lists[0].Records) != 2 {
		t.Fatalf("lists = %+v", w.Lists)
	}
	record := w.Lists[0].Records[1]
	if *record.ID != "r1" || *record.Mistakes != 2 || *record.Accuracy != 97.5 || record.Device.Name != "自宅" {
		t.Fatalf("record = %+v", record)
	}
	if !record.At.Equal(time.Date(2026, 10, 10, 2, 0, 0, 0, time.UTC)) {
		t.Fatalf("at = %v", record.At)
	}
	if w.Devices[0] != (Device{ID: "d1", Name: "自宅", Layout: "JIS"}) {
		t.Fatalf("devices = %+v", w.Devices)
	}
	if w.Find("l1") != &w.Lists[0] || w.Find("missing") != nil {
		t.Fatal("Find")
	}
}

func TestDecodeEmptyRow(t *testing.T) {
	for _, devices := range []string{`[]`, `null`} {
		w, err := Decode([]byte(`[]`), []byte(devices), nil)
		if err != nil || len(w.Lists) != 0 || w.Devices == nil || len(w.Devices) != 0 {
			t.Fatalf("devices %s: w = %+v, err = %v", devices, w, err)
		}
	}
}

// Since v0.98.0 a workspace starts empty: official packs are followed from the catalog (see OfficialPacks).
func TestInitial(t *testing.T) {
	w, err := Initial()
	if err != nil {
		t.Fatal(err)
	}
	if w.Packs == nil || w.Lists == nil || w.Devices == nil || len(w.Packs)+len(w.Lists)+len(w.Devices) != 0 {
		t.Fatalf("initial = %+v", w)
	}
	lists, packs := encodeBoth(t, w)
	if string(lists) != "[]" || string(packs) != "[]" {
		t.Fatalf("lists = %s, packs = %s", lists, packs)
	}
}

// The category and tags are optional. Lists saved before packs existed give theirs to their packs, which are written
// with them; the lists are written without.
func TestDecodeLabels(t *testing.T) {
	w, err := Decode([]byte(`[{"id":"a","name":"A","category":"語学","tags":["英語","<b>"],"createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]},
		{"id":"b","name":"B","category":null,"tags":null,"createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`), []byte(`[]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	if a := w.Lists[0]; a.Category != "語学" || !reflect.DeepEqual(a.Tags, []string{"英語", "<b>"}) || a.Extra != "" {
		t.Fatalf("list = %+v", a)
	}
	encoded, err := Encode(w.Lists)
	if err != nil || !strings.Contains(string(encoded), `{"id":"a","name":"A","packId":"pack-a","createdAt"`) ||
		!strings.Contains(string(encoded), `{"id":"b","name":"B","packId":"pack-b","createdAt"`) {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
	packs, err := EncodePacks(w.Packs)
	if err != nil || string(packs) != `[{"id":"pack-a","name":"A","category":"語学","tags":["英語","<b>"],"createdAt":"x"},{"id":"pack-b","name":"B","createdAt":"x"}]` {
		t.Fatalf("packs = %s, %v", packs, err)
	}
	for _, labels := range []string{`"category":1`, `"tags":"a"`, `"tags":[1]`, `"tags":[null]`} {
		if _, err := Decode([]byte(`[{"id":"a","name":"A",`+labels+`,"createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`), []byte(`[]`), nil); err == nil {
			t.Errorf("%s was read", labels)
		}
	}
}

func TestPacksMatchApp(t *testing.T) {
	copies := map[string][]byte{"samples.json": samplesJSON, "countries.json": countriesJSON}
	entries, err := fs.ReadDir(commandFiles, "packs/commands")
	if err != nil {
		t.Fatal(err)
	}
	originals, err := os.ReadDir(filepath.Join("..", "..", "..", "src", "plugins", "packs", "commands"))
	if err != nil {
		t.Fatal(err)
	}
	var originalNames []string
	for _, entry := range originals {
		if strings.HasSuffix(entry.Name(), ".json") {
			originalNames = append(originalNames, entry.Name())
		}
	}
	var copyNames []string
	for _, entry := range entries {
		name := "commands/" + entry.Name()
		copies[name], err = commandFiles.ReadFile("packs/" + name)
		if err != nil {
			t.Fatal(err)
		}
		copyNames = append(copyNames, entry.Name())
	}
	if !slices.Equal(originalNames, copyNames) {
		t.Fatal("command files differ from src/plugins/packs; run go generate ./...")
	}
	for name, copy := range copies {
		original, err := os.ReadFile(filepath.Join("..", "..", "..", "src", "plugins", "packs", name))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(original, copy) {
			t.Errorf("packs/%s differs from src/plugins/packs; run go generate ./...", name)
		}
	}
}

func TestDecodeRefusesWhatTheAppRefuses(t *testing.T) {
	list := func(records string) string {
		return `[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}],"records":[` + records + `]}]`
	}
	word := `"words":[{"display":"a","input":"a","annotation":""}],"records":[]`
	cases := map[string][2]string{
		"lists not JSON":    {`{`, `[]`},
		"lists null":        {`null`, `[]`},
		"lists object":      {`{}`, `[]`},
		"null list":         {`[null]`, `[]`},
		"empty id":          {`[{"id":"","name":"n","createdAt":"c",` + word + `}]`, `[]`},
		"duplicate id":      {`[{"id":"l","name":"n","createdAt":"c",` + word + `},{"id":"l","name":"m","createdAt":"c",` + word + `}]`, `[]`},
		"blank name":        {`[{"id":"l","name":" ","createdAt":"c",` + word + `}]`, `[]`},
		"no words":          {`[{"id":"l","name":"n","createdAt":"c","words":[],"records":[]}]`, `[]`},
		"blank input":       {`[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":" ","annotation":""}],"records":[]}]`, `[]`},
		"no annotation":     {`[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":"a"}],"records":[]}]`, `[]`},
		"no records":        {`[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}]}]`, `[]`},
		"negative time":     {list(`{"time":-1,"date":"2026-01-01"}`), `[]`},
		"bad date":          {list(`{"time":1,"date":"yesterday"}`), `[]`},
		"accuracy 101":      {list(`{"time":1,"date":"2026-01-01","accuracy":101}`), `[]`},
		"fraction mistake":  {list(`{"time":1,"date":"2026-01-01","mistakes":1.5}`), `[]`},
		"zero wordCount":    {list(`{"time":1,"date":"2026-01-01","wordCount":0}`), `[]`},
		"bad device":        {list(`{"time":1,"date":"2026-01-01","device":{"id":"d","name":" ","layout":""}}`), `[]`},
		"devices not array": {`[]`, `{}`},
		"default device":    {`[]`, `[{"id":"default","name":"x","layout":""}]`},
		"duplicate device":  {`[]`, `[{"id":"d","name":"x","layout":""},{"id":"d","name":"y","layout":""}]`},
		"device no layout":  {`[]`, `[{"id":"d","name":"x"}]`},
		"long device name":  {`[]`, `[{"id":"d","name":"` + strings.Repeat("x", 101) + `","layout":""}]`},
	}
	for name, row := range cases {
		if _, err := Decode([]byte(row[0]), []byte(row[1]), nil); err == nil {
			t.Errorf("%s: decoded", name)
		}
	}
}

func TestParseTime(t *testing.T) {
	local := func(parts ...int) time.Time {
		return time.Date(parts[0], time.Month(parts[1]), parts[2], parts[3], parts[4], parts[5], 0, time.Local)
	}
	cases := map[string]time.Time{
		"2026-10-10T02:00:00.000Z":    time.Date(2026, 10, 10, 2, 0, 0, 0, time.UTC),
		"2026-09-26T03:01:23.866446Z": time.Date(2026, 9, 26, 3, 1, 23, 866446000, time.UTC),
		"2026-10-10T11:00:00+09:00":   time.Date(2026, 10, 10, 2, 0, 0, 0, time.UTC),
		"2026-10-10T02:00Z":           time.Date(2026, 10, 10, 2, 0, 0, 0, time.UTC),
		"2026-01-01":                  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		"2026-01-01T09:30":            local(2026, 1, 1, 9, 30, 0),
		"2026-01-01T09:30:15.5":       local(2026, 1, 1, 9, 30, 15).Add(500 * time.Millisecond),
		"2024/09/22 10:05":            local(2024, 9, 22, 10, 5, 0),
		"2024/9/2 10:05:07":           local(2024, 9, 2, 10, 5, 7),
		"2024/09/22":                  local(2024, 9, 22, 0, 0, 0),
	}
	for input, want := range cases {
		if at, ok := ParseTime(input); !ok || !at.Equal(want) {
			t.Errorf("ParseTime(%q) = %v, %v; want %v", input, at, ok, want)
		}
	}
	for _, input := range []string{"", "yesterday", "2026-13-01", "10:05"} {
		if _, ok := ParseTime(input); ok {
			t.Errorf("ParseTime(%q) succeeded", input)
		}
	}
}

func TestCheckLimits(t *testing.T) {
	words := func(n int) []Word { return make([]Word, n) }
	text := func(n int, unit string) string { return strings.Repeat(unit, n) }
	ok := []List{
		{Name: text(MaxListName, "a"), Words: words(MaxWords), Records: make([]Record, MaxRecords)},
		{Name: text(MaxListName/2, "𠮷"), Words: []Word{{Input: text(MaxWordText, "a"), Display: text(MaxWordText, "a"), Annotation: text(MaxAnnotation, "a")}}},
		{Category: text(MaxCategory, "a"), Tags: slices.Repeat([]string{text(MaxTag, "a")}, MaxTags)},
		{Group: text(MaxGroup/2, "𠮷")},
	}
	if err := CheckLimits(ok); err != nil {
		t.Fatalf("limits themselves refused: %v", err)
	}
	tooMany := []struct {
		name string
		list List
	}{
		{"words", List{Words: words(MaxWords + 1)}},
		{"records", List{Records: make([]Record, MaxRecords+1)}},
		{"name", List{Name: text(MaxListName+1, "a")}},
		{"name in UTF-16 units", List{Name: text(MaxListName/2, "𠮷") + "a"}},
		{"input", List{Words: []Word{{Input: text(MaxWordText+1, "a")}}}},
		{"display", List{Words: []Word{{Display: text(MaxWordText+1, "a")}}}},
		{"annotation", List{Words: []Word{{Annotation: text(MaxAnnotation+1, "a")}}}},
		{"category", List{Category: text(MaxCategory+1, "a")}},
		{"tags", List{Tags: make([]string, MaxTags+1)}},
		{"tag", List{Tags: []string{text(MaxTag+1, "a")}}},
		{"group", List{Group: text(MaxGroup+1, "a")}},
		{"group in UTF-16 units", List{Group: text(MaxGroup/2, "𠮷") + "a"}},
	}
	for _, c := range tooMany {
		var e *Error
		if err := CheckLimits([]List{ok[0], c.list}); !errors.As(err, &e) || e.Key != "invalidWorkspace" {
			t.Errorf("%s over the limit: %v", c.name, err)
		}
	}
}

func TestDecodeRecordMode(t *testing.T) {
	list := func(mode string) []byte {
		return []byte(`[{"id":"l1","name":"a","createdAt":"2026-10-10","words":[{"display":"a","input":"a","annotation":""}],` +
			`"records":[{"id":"r1","time":1,"date":"2026-10-10T02:00:00.000Z"` + mode + `}]}]`)
	}
	w, err := Decode(list(`,"mode":"recall"`), []byte(`[]`), nil)
	if err != nil {
		t.Fatal(err)
	}
	record := w.Lists[0].Records[0]
	if record.Mode != RecallMode || record.Extra != "" {
		t.Fatalf("record = %+v", record)
	}
	written, err := Encode(w.Lists)
	if err != nil || !strings.Contains(string(written), `"mode":"recall"`) || strings.Count(string(written), `"mode"`) != 1 {
		t.Fatalf("written = %s, %v", written, err)
	}
	for _, bad := range []string{`,"mode":"x"`, `,"mode":""`, `,"mode":1`} {
		if _, err := Decode(list(bad), []byte(`[]`), nil); err == nil {
			t.Errorf("Decode accepted %s", bad)
		}
	}
	w, err = Decode(list(``), []byte(`[]`), nil)
	if err != nil || w.Lists[0].Records[0].Mode != "" {
		t.Fatalf("plain record = %+v, %v", w, err)
	}
	if written, _ := Encode(w.Lists); strings.Contains(string(written), `"mode"`) {
		t.Fatalf("written = %s", written)
	}
}
