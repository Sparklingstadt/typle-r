package workspace

import (
	"math"
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
