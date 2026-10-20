package workspace

import (
	"fmt"
	"slices"
	"testing"
	"time"
)

// at is 2026-09-day at hour, UTC.
func at(day, hour int) string {
	return time.Date(2026, 9, day, hour, 0, 0, 0, time.UTC).Format("2006-01-02T15:04:05.000Z")
}

func practice(id string, seconds float64, accuracy *float64, wordCount int, day int, device *Device) Record {
	r := dated(at(day, 12), wordCount)
	r.Time, r.Accuracy, r.Device = seconds, accuracy, device
	if id != "" {
		r.ID = &id
	}
	return r
}

func ids(records []Record) []string {
	out := []string{}
	for _, r := range records {
		if r.ID == nil {
			out = append(out, fmt.Sprintf("@%s", r.Date))
		} else {
			out = append(out, *r.ID)
		}
	}
	return out
}

var (
	mac = &Device{ID: "mac", Name: "MacBook Air", Layout: "JIS"}
	pad = &Device{ID: "pad", Name: "iPad"}
)

// "英単語" had 10 words, then 2 were added: the older, shorter runs must not outrank today's runs.
func edited() List {
	words := make([]Word, 12)
	return List{ID: "en", Name: "英単語", Words: words, Records: []Record{
		practice("old1", 11.84, number(100), 10, 20, mac),
		practice("old2", 12.9, number(98), 10, 21, pad),
		practice("new1", 15.2, number(97.5), 12, 26, mac),
		practice("new2", 14.35, number(100), 12, 28, pad),
		practice("new3", 20.05, number(100), 12, 29, mac),
		practice("legacy", 9.5, nil, 0, 10, nil),
	}}
}

// The cases of tests/rankings.test.cjs.
func TestRankRecords(t *testing.T) {
	records := []Record{practice("a", 20.05, number(100), 5, 1, nil), practice("b", 17.96, number(96.6), 5, 2, nil),
		practice("c", 17.96, number(99), 5, 3, nil), practice("d", 9, nil, 5, 4, nil)}
	if got := ids(RankRecords(records, "accuracy")); !slices.Equal(got, []string{"a", "c", "b", "d"}) {
		t.Fatalf("accuracy = %v", got)
	}
	if got := ids(RankRecords(records, "speed")); !slices.Equal(got, []string{"d", "c", "b", "a"}) {
		t.Fatalf("speed = %v", got)
	}
	if got := ids(records); !slices.Equal(got, []string{"a", "b", "c", "d"}) {
		t.Fatal("ranking changed the stored order")
	}
}

func TestListBest(t *testing.T) {
	list := edited()
	if got := ids(ComparableRecords(&list, list.Records)); !slices.Equal(got, []string{"new1", "new2", "new3"}) {
		t.Fatalf("comparable = %v", got)
	}
	if best := ListBest(&list); best != &list.Records[3] {
		t.Fatalf("best = %+v", best)
	}
	onlyOld := edited()
	onlyOld.Records = slices.DeleteFunc(onlyOld.Records, func(r Record) bool { return r.WordCount != nil && *r.WordCount == 12 })
	if len(ComparableRecords(&onlyOld, onlyOld.Records)) != 3 || *ListBest(&onlyOld).ID != "old1" {
		t.Fatalf("best of old = %+v", ListBest(&onlyOld))
	}
	empty := edited()
	empty.Records = nil
	if ListBest(&empty) != nil {
		t.Fatal("best of nothing")
	}
}
