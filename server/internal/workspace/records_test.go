package workspace

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

func number(value float64) *float64 { return &value }

// run is a valid record for TestAddRecord's lists.
func run() RecordInput {
	return RecordInput{Time: number(3.5), Date: text("2026-10-10T11:00:00+09:00"), Mistakes: number(1), Accuracy: number(97.5)}
}

func TestAddRecord(t *testing.T) {
	w := two()
	record, added, err := AddRecord(w, "l1", run(), "new")
	if err != nil || !added {
		t.Fatalf("added = %v, err = %v", added, err)
	}
	if *record.ID != "new" || record.Time != 3.5 || record.Date != "2026-10-10T02:00:00.000Z" || *record.Mistakes != 1 ||
		*record.Accuracy != 97.5 || *record.WordCount != 1 || record.Device != nil {
		t.Fatalf("record = %+v", record)
	}
	if !record.At.Equal(time.Date(2026, 10, 10, 2, 0, 0, 0, time.UTC)) {
		t.Fatalf("at = %v", record.At)
	}
	if records := w.Lists[0].Records; len(records) != 2 || *records[1].ID != "new" {
		t.Fatalf("records = %+v", records)
	}

	input := run()
	input.ID, input.WordCount, input.DeviceID = text("run-1"), number(5), text("d1")
	record, _, err = AddRecord(w, "l1", input, "unused")
	if err != nil || *record.ID != "run-1" || *record.WordCount != 5 || *record.Device != (Device{ID: "d1", Name: "自宅", Layout: "JIS"}) {
		t.Fatalf("record = %+v, %v", record, err)
	}
	// The device is copied: renaming it later leaves the record as it was.
	w.Devices[0].Name = "会社"
	if w.Lists[0].Records[2].Device.Name != "自宅" {
		t.Fatal("device is shared")
	}

	input.ID, input.DeviceID = text("run-2"), text("default")
	record, _, err = AddRecord(w, "l1", input, "unused")
	if err != nil || *record.Device != (Device{ID: "default", Name: "デフォルト", Layout: ""}) {
		t.Fatalf("record = %+v, %v", record, err)
	}
}

func TestAddRecordSameID(t *testing.T) {
	w := two()
	input := run()
	input.ID = text("run-1")
	first, _, err := AddRecord(w, "l1", input, "unused")
	if err != nil {
		t.Fatal(err)
	}
	input.Time = number(99)
	again, added, err := AddRecord(w, "l1", input, "unused")
	if err != nil || added || again.Time != 3.5 || *again.ID != *first.ID {
		t.Fatalf("again = %+v, added = %v, err = %v", again, added, err)
	}
	if len(w.Lists[0].Records) != 2 {
		t.Fatalf("records = %+v", w.Lists[0].Records)
	}
}

func TestAddRecordErrors(t *testing.T) {
	change := func(edit func(*RecordInput)) RecordInput {
		input := run()
		edit(&input)
		return input
	}
	cases := []struct {
		name  string
		input RecordInput
		key   string
	}{
		{"no time", change(func(r *RecordInput) { r.Time = nil }), "invalidRecord"},
		{"negative time", change(func(r *RecordInput) { r.Time = number(-1) }), "invalidRecord"},
		{"infinite time", change(func(r *RecordInput) { r.Time = number(math.Inf(1)) }), "invalidRecord"},
		{"no date", change(func(r *RecordInput) { r.Date = nil }), "invalidRecord"},
		{"bad date", change(func(r *RecordInput) { r.Date = text("abc") }), "invalidRecord"},
		// Readable here, but outside the years toISOString and Date.parse write and read once moved to UTC.
		{"date before year 0 in UTC", change(func(r *RecordInput) { r.Date = text("0000-01-01T00:00:00+09:00") }), "invalidRecord"},
		{"date after year 9999 in UTC", change(func(r *RecordInput) { r.Date = text("9999-12-31T23:59:59-09:00") }), "invalidRecord"},
		{"no mistakes", change(func(r *RecordInput) { r.Mistakes = nil }), "invalidRecord"},
		{"fractional mistakes", change(func(r *RecordInput) { r.Mistakes = number(1.5) }), "invalidRecord"},
		{"negative mistakes", change(func(r *RecordInput) { r.Mistakes = number(-1) }), "invalidRecord"},
		{"no accuracy", change(func(r *RecordInput) { r.Accuracy = nil }), "invalidRecord"},
		{"accuracy over 100", change(func(r *RecordInput) { r.Accuracy = number(100.5) }), "invalidRecord"},
		{"negative accuracy", change(func(r *RecordInput) { r.Accuracy = number(-0.5) }), "invalidRecord"},
		{"zero words", change(func(r *RecordInput) { r.WordCount = number(0) }), "invalidRecord"},
		{"fractional words", change(func(r *RecordInput) { r.WordCount = number(1.5) }), "invalidRecord"},
		{"huge words", change(func(r *RecordInput) { r.WordCount = number(1e300) }), "invalidRecord"},
		{"empty id", change(func(r *RecordInput) { r.ID = text("") }), "invalidRecord"},
		{"id with a space", change(func(r *RecordInput) { r.ID = text("a b") }), "invalidRecord"},
		{"long id", change(func(r *RecordInput) { r.ID = text(strings.Repeat("a", 101)) }), "invalidRecord"},
		{"unknown device", change(func(r *RecordInput) { r.DeviceID = text("zz") }), "deviceNotFound"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := two()
			_, _, err := AddRecord(w, "l1", c.input, "new")
			wantKey(t, err, c.key)
			if len(w.Lists[0].Records) != 1 {
				t.Fatalf("records = %+v", w.Lists[0].Records)
			}
		})
	}
	_, _, err := AddRecord(two(), "missing", run(), "new")
	wantKey(t, err, "listNotFound")
	// The longest id and the edges of the ranges pass.
	edges := change(func(r *RecordInput) {
		r.ID, r.Time, r.Mistakes, r.Accuracy = text(strings.Repeat("a_-", 33)+"Z"), number(0), number(0), number(100)
	})
	if _, _, err := AddRecord(two(), "l1", edges, "new"); err != nil {
		t.Fatal(err)
	}
}

func TestAddRecordLimit(t *testing.T) {
	w := two()
	for len(w.Lists[0].Records) < MaxRecords {
		w.Lists[0].Records = append(w.Lists[0].Records, w.Lists[0].Records[0])
	}
	_, _, err := AddRecord(w, "l1", run(), "new")
	wantKey(t, err, "recordLimit")
	// Sending a saved record again adds nothing, so it is not refused.
	input := run()
	input.ID = text("r1")
	if record, added, err := AddRecord(w, "l1", input, "new"); err != nil || added || record.Time != 1 {
		t.Fatalf("record = %+v, added = %v, err = %v", record, added, err)
	}
}

// one has a record r1 on l1, with a field Typle does not know.
func one(t *testing.T) *Workspace {
	t.Helper()
	w := two()
	input := run()
	input.ID, input.DeviceID = text("r9"), text("d1")
	if _, _, err := AddRecord(w, "l1", input, "unused"); err != nil {
		t.Fatal(err)
	}
	w.Lists[0].Records[1].Extra = `{"keys":[1]}`
	return w
}

func TestUpdateRecord(t *testing.T) {
	w := one(t)
	record, err := UpdateRecord(w, "l1", "r9", RecordChange{Time: number(9.5), Date: text("2026-10-11T09:00:00+09:00")})
	if err != nil {
		t.Fatal(err)
	}
	if record.Time != 9.5 || record.Date != "2026-10-11T00:00:00.000Z" || !record.At.Equal(time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)) ||
		*record.Mistakes != 1 || *record.Accuracy != 97.5 || *record.WordCount != 1 || record.Device.ID != "d1" || record.Extra != `{"keys":[1]}` {
		t.Fatalf("record = %+v", record)
	}
	if !reflect.DeepEqual(w.Lists[0].Records[1], record) {
		t.Fatalf("saved = %+v", w.Lists[0].Records[1])
	}
	record, err = UpdateRecord(w, "l1", "r9", RecordChange{Mistakes: number(0), Accuracy: number(100), WordCount: number(3), DeviceID: text("default")})
	if err != nil || *record.Mistakes != 0 || *record.Accuracy != 100 || *record.WordCount != 3 || record.Device.Name != "デフォルト" {
		t.Fatalf("record = %+v, %v", record, err)
	}
	// "" takes the device off, as 未選択 does in the app.
	if record, err = UpdateRecord(w, "l1", "r9", RecordChange{DeviceID: text("")}); err != nil || record.Device != nil {
		t.Fatalf("record = %+v, %v", record, err)
	}
	if len(w.Lists[0].Records) != 2 {
		t.Fatalf("records = %+v", w.Lists[0].Records)
	}
}

func TestUpdateRecordErrors(t *testing.T) {
	cases := []struct {
		name         string
		list, record string
		change       RecordChange
		key          string
	}{
		{"missing list", "missing", "r9", RecordChange{Time: number(1)}, "listNotFound"},
		{"missing record", "l1", "missing", RecordChange{Time: number(1)}, "recordNotFound"},
		{"negative time", "l1", "r9", RecordChange{Time: number(-1)}, "invalidRecord"},
		{"bad date", "l1", "r9", RecordChange{Date: text("abc")}, "invalidRecord"},
		{"date after 9999", "l1", "r9", RecordChange{Date: text("9999-12-31T23:59:59-09:00")}, "invalidRecord"},
		{"fractional mistakes", "l1", "r9", RecordChange{Mistakes: number(1.5)}, "invalidRecord"},
		{"accuracy over 100", "l1", "r9", RecordChange{Accuracy: number(101)}, "invalidRecord"},
		{"zero words", "l1", "r9", RecordChange{WordCount: number(0)}, "invalidRecord"},
		{"unknown device", "l1", "r9", RecordChange{DeviceID: text("zz")}, "deviceNotFound"},
		// A record without an id cannot be named.
		{"record without id", "l1", "", RecordChange{Time: number(1)}, "recordNotFound"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := one(t)
			w.Lists[0].Records = append(w.Lists[0].Records, Record{Time: 2, Date: "2026-10-01T00:00:00.000Z"})
			before := slices.Clone(w.Lists[0].Records)
			_, err := UpdateRecord(w, c.list, c.record, c.change)
			wantKey(t, err, c.key)
			if !reflect.DeepEqual(w.Lists[0].Records, before) {
				t.Fatalf("records changed: %+v", w.Lists[0].Records)
			}
		})
	}
}

func TestDeleteRecord(t *testing.T) {
	w := one(t)
	if err := DeleteRecord(w, "l1", "r1"); err != nil {
		t.Fatal(err)
	}
	if len(w.Lists[0].Records) != 1 || *w.Lists[0].Records[0].ID != "r9" {
		t.Fatalf("records = %+v", w.Lists[0].Records)
	}
	wantKey(t, DeleteRecord(w, "l1", "r1"), "recordNotFound")
	wantKey(t, DeleteRecord(w, "missing", "r9"), "listNotFound")
	wantKey(t, DeleteRecord(w, "l1", ""), "recordNotFound")
}

func TestFindRecord(t *testing.T) {
	w := one(t)
	if record := w.Lists[0].FindRecord("r9"); record == nil || record.Time != 3.5 {
		t.Fatalf("record = %+v", record)
	}
	if w.Lists[0].FindRecord("missing") != nil || w.Lists[0].FindRecord("") != nil {
		t.Fatal("found a missing record")
	}
}

// The fixtures are shared with tests/records.test.cjs, so the guest's workspace adds a run as the account's does.
func TestAddRecordFixtures(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "tests", "fixtures", "records", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatalf("fixtures: %v, %v", files, err)
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var fixture struct {
				Lists, Devices json.RawMessage
				ListID         string
				Input          RecordInput
				Expected       struct {
					Added  bool
					Record json.RawMessage
					Error  string
				}
			}
			if err := json.Unmarshal(data, &fixture); err != nil {
				t.Fatal(err)
			}
			w, err := Decode(fixture.Lists, fixture.Devices, nil)
			if err != nil {
				t.Fatal(err)
			}
			record, added, err := AddRecord(w, fixture.ListID, fixture.Input, "unused")
			if fixture.Expected.Error != "" {
				var refused *Error
				if !errors.As(err, &refused) || refused.Key != fixture.Expected.Error {
					t.Fatalf("error = %v, want %s", err, fixture.Expected.Error)
				}
				return
			}
			if err != nil || added != fixture.Expected.Added {
				t.Fatalf("added = %v, %v; want %v", added, err, fixture.Expected.Added)
			}
			got, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			sameJSON(t, "record", got, fixture.Expected.Record)
		})
	}
}

// The fixtures are shared with tests/records.test.cjs: the same steps leave the same records in Go and in the app.
func TestRecordOperationFixtures(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "tests", "fixtures", "record-operations", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatalf("fixtures: %v, %v", files, err)
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var fixture struct {
				Lists, Devices json.RawMessage
				Steps          []struct {
					Op, ListID, RecordID string
					Input                RecordInput
					Expected             struct {
						Added, Deleted bool
						Error          string
					}
				}
				Expected map[string]json.RawMessage
			}
			if err := json.Unmarshal(data, &fixture); err != nil {
				t.Fatal(err)
			}
			w, err := Decode(fixture.Lists, fixture.Devices, nil)
			if err != nil {
				t.Fatal(err)
			}
			for i, step := range fixture.Steps {
				var refused *Error
				switch step.Op {
				case "add":
					_, added, err := AddRecord(w, step.ListID, step.Input, "unused")
					if step.Expected.Error != "" {
						if !errors.As(err, &refused) || refused.Key != step.Expected.Error {
							t.Fatalf("step %d: error = %v, want %s", i, err, step.Expected.Error)
						}
					} else if err != nil || added != step.Expected.Added {
						t.Fatalf("step %d: added = %v, %v", i, added, err)
					}
				case "delete":
					err := DeleteRecord(w, step.ListID, step.RecordID)
					// The operation's answer to a record or list already gone (see operation.DeleteRecord's callers).
					gone := errors.As(err, &refused) && (refused.Key == "recordNotFound" || refused.Key == "listNotFound")
					if (err != nil && !gone) || (err == nil) != step.Expected.Deleted {
						t.Fatalf("step %d: deleted = %v, want %v", i, err, step.Expected.Deleted)
					}
				default:
					t.Fatalf("step %d: unknown op %q", i, step.Op)
				}
			}
			for listID, want := range fixture.Expected {
				list := w.Find(listID)
				if list == nil {
					t.Fatalf("no list %s", listID)
				}
				records := list.Records
				if records == nil {
					records = []Record{}
				}
				got, err := json.Marshal(records)
				if err != nil {
					t.Fatal(err)
				}
				sameJSON(t, listID, got, want)
			}
		})
	}
}

func TestUpdateRecordKeepsMode(t *testing.T) {
	w := two()
	input := run()
	input.ID, input.Mode = text("w1"), text("writing")
	if _, _, err := AddRecord(w, "l1", input, "unused"); err != nil {
		t.Fatal(err)
	}
	record, err := UpdateRecord(w, "l1", "w1", RecordChange{Time: number(9.5)})
	if err != nil || record.Mode != "writing" || RecordMode(&record) != "writing" {
		t.Fatalf("record = %+v, %v", record, err)
	}
	typing := Record{}
	if RecordMode(&typing) != "typing" {
		t.Fatal("a record without mode is a typing run")
	}
}

func TestRecordModeStored(t *testing.T) {
	lists := func(mode string) []byte {
		return []byte(`[{"id":"l","name":"L","createdAt":"2026-10-01","words":[{"display":"a","input":"a","annotation":""}],"records":[{"id":"r","time":1,"date":"2026-10-01T00:00:00.000Z"` + mode + `}]}]`)
	}
	w, err := Decode(lists(`,"mode":"writing"`), []byte(`[]`), nil)
	if err != nil || w.Lists[0].Records[0].Mode != "writing" || w.Lists[0].Records[0].Extra != "" {
		t.Fatalf("workspace = %+v, %v", w, err)
	}
	out, err := json.Marshal(w.Lists[0].Records[0])
	if err != nil || strings.Count(string(out), `"mode"`) != 1 {
		t.Fatalf("out = %s, %v", out, err)
	}
	if w, err = Decode(lists(`,"mode":null`), []byte(`[]`), nil); err != nil || w.Lists[0].Records[0].Mode != "" {
		t.Fatalf("null mode: %+v, %v", w, err)
	}
	for _, bad := range []string{`,"mode":"typing"`, `,"mode":""`, `,"mode":1`} {
		if _, err := Decode(lists(bad), []byte(`[]`), nil); err == nil {
			t.Fatalf("%s was accepted", bad)
		}
	}
}
