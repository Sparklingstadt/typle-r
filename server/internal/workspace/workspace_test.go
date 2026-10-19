package workspace

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const stored = `{
  "version": 1, "accountId": "guest:local", "revision": 3,
  "lists": [{
    "id": "l1", "name": " 英単語 ", "createdAt": "2026-10-10T01:23:45.000Z", "shared": true, "shareId": "s",
    "words": [{ "display": "apple", "input": "apple", "annotation": "りんご" }],
    "records": [
      { "time": 5, "date": "2024/09/22 10:05" },
      { "id": "r1", "time": 63.5, "date": "2026-10-10T02:00:00.000Z", "mistakes": 2, "accuracy": 97.5, "wordCount": 1,
        "device": { "id": "d1", "name": "自宅", "layout": "JIS" } }
    ]
  }],
  "devices": [{ "id": "d1", "name": " 自宅 ", "layout": " JIS " }]
}`

func TestDecodeStoredWorkspace(t *testing.T) {
	w, err := Decode([]byte(stored))
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Lists) != 1 || w.Lists[0].Name != " 英単語 " || len(w.Lists[0].Records) != 2 {
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

func TestDecodeWithoutAccountOrDevices(t *testing.T) {
	w, err := Decode([]byte(`{"version":1,"lists":[]}`))
	if err != nil || len(w.Lists) != 0 || w.Devices == nil || len(w.Devices) != 0 {
		t.Fatalf("w = %+v, err = %v", w, err)
	}
}

func TestRevisionZeroShowsInitialLists(t *testing.T) {
	w, err := Decode([]byte(`{"version":1,"accountId":"guest:local","revision":0,"lists":[],"devices":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	initial, _ := Initial()
	if len(w.Lists) != len(initial.Lists) || w.Lists[0].ID != "sample-1" {
		t.Fatalf("lists = %+v", w.Lists)
	}
}

func TestInitial(t *testing.T) {
	w, err := Initial()
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, list := range w.Lists {
		ids = append(ids, list.ID)
		if len(list.Records) != 0 {
			t.Fatalf("%s has records", list.ID)
		}
	}
	if strings.Join(ids, ",") != "sample-1,sample-2,un-member-states-chinese-193" || len(w.Lists[2].Words) != 193 {
		t.Fatalf("ids = %v", ids)
	}
}

func TestPacksMatchApp(t *testing.T) {
	for name, copy := range map[string][]byte{"samples.json": samplesJSON, "countries.json": countriesJSON} {
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
	list := func(fields string) string {
		return `{"version":1,"lists":[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}],"records":[]` + fields + `}]}`
	}
	cases := map[string]string{
		"not JSON":          `{`,
		"no version":        `{"lists":[]}`,
		"version 2":         `{"version":2,"lists":[]}`,
		"other account":     `{"version":1,"accountId":"github:1","lists":[]}`,
		"negative revision": `{"version":1,"revision":-1,"lists":[]}`,
		"no lists":          `{"version":1}`,
		"null list":         `{"version":1,"lists":[null]}`,
		"empty id":          `{"version":1,"lists":[{"id":"","name":"n","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]}`,
		"duplicate id": `{"version":1,"lists":[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}],"records":[]},` +
			`{"id":"l","name":"m","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]}`,
		"blank name":       `{"version":1,"lists":[{"id":"l","name":" ","createdAt":"c","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]}`,
		"no words":         `{"version":1,"lists":[{"id":"l","name":"n","createdAt":"c","words":[],"records":[]}]}`,
		"blank input":      `{"version":1,"lists":[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":" ","annotation":""}],"records":[]}]}`,
		"no annotation":    `{"version":1,"lists":[{"id":"l","name":"n","createdAt":"c","words":[{"display":"a","input":"a"}],"records":[]}]}`,
		"negative time":    strings.Replace(list(""), `"records":[]`, `"records":[{"time":-1,"date":"2026-01-01"}]`, 1),
		"bad date":         strings.Replace(list(""), `"records":[]`, `"records":[{"time":1,"date":"yesterday"}]`, 1),
		"accuracy 101":     strings.Replace(list(""), `"records":[]`, `"records":[{"time":1,"date":"2026-01-01","accuracy":101}]`, 1),
		"fraction mistake": strings.Replace(list(""), `"records":[]`, `"records":[{"time":1,"date":"2026-01-01","mistakes":1.5}]`, 1),
		"zero wordCount":   strings.Replace(list(""), `"records":[]`, `"records":[{"time":1,"date":"2026-01-01","wordCount":0}]`, 1),
		"bad device":       strings.Replace(list(""), `"records":[]`, `"records":[{"time":1,"date":"2026-01-01","device":{"id":"d","name":" ","layout":""}}]`, 1),
		"default device":   `{"version":1,"lists":[],"devices":[{"id":"default","name":"x","layout":""}]}`,
		"duplicate device": `{"version":1,"lists":[],"devices":[{"id":"d","name":"x","layout":""},{"id":"d","name":"y","layout":""}]}`,
		"device no layout": `{"version":1,"lists":[],"devices":[{"id":"d","name":"x"}]}`,
		"long device name": `{"version":1,"lists":[],"devices":[{"id":"d","name":"` + strings.Repeat("x", 101) + `","layout":""}]}`,
	}
	for name, input := range cases {
		if _, err := Decode([]byte(input)); err == nil {
			t.Errorf("%s: decoded", name)
		}
	}
}

func TestDecodeRefusesLegacyProfilesAndLargeFiles(t *testing.T) {
	if _, err := Decode([]byte(`{"version":1,"lists":[],"profiles":[{"id":"default","name":"x","lists":[]}]}`)); !errors.Is(err, ErrLegacyProfiles) {
		t.Fatalf("err = %v", err)
	}
	if _, err := Decode([]byte(`{"version":1,"lists":[],"profiles":[]}`)); err != nil {
		t.Fatalf("empty profiles: %v", err)
	}
	if _, err := Decode(bytes.Repeat([]byte(" "), MaxBytes+1)); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("err = %v", err)
	}
}

func TestLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "workspace.json")
	if err := os.WriteFile(path, []byte(stored), 0o600); err != nil {
		t.Fatal(err)
	}
	if w, err := Load(path); err != nil || len(w.Lists) != 1 {
		t.Fatalf("w = %+v, err = %v", w, err)
	}
	if _, err := Load(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Fatal("loaded a missing file")
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
