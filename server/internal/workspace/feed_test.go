package workspace

import (
	"slices"
	"testing"
)

func history() []List {
	renamed := &Device{ID: "mac", Name: "Old name", Layout: "JIS"}
	a1, a2, b1 := practice("a1", 5, number(95), 5, 28, mac), practice("a2", 4, number(100), 5, 29, renamed), practice("b1", 70, number(90), 20, 29, nil)
	a1.Date, a2.Date, b1.Date = at(28, 9), at(29, 20), at(29, 10)
	for _, r := range []*Record{&a1, &a2, &b1} {
		r.At, _ = ParseTime(r.Date)
	}
	old := dated(at(27, 8), 0)
	old.Time = 3
	return []List{
		{ID: "a", Name: "A", Records: []Record{a1, a2, old}},
		{ID: "b", Name: "B", Records: []Record{b1}},
	}
}

func feedIDs(rows []FeedRow) (ids []string, best []string) {
	for _, row := range rows {
		id := "@" + row.Record.Date
		if row.Record.ID != nil {
			id = *row.Record.ID
		}
		ids = append(ids, row.List.ID+"-"+id)
		if row.Best {
			best = append(best, row.List.ID+"-"+id)
		}
	}
	return ids, best
}

// The cases of tests/records.test.cjs.
func TestFeed(t *testing.T) {
	lists := history()
	ids, best := feedIDs(Feed(lists, "", ""))
	if !slices.Equal(ids, []string{"a-a2", "b-b1", "a-a1", "a-@" + at(27, 8)}) || !slices.Equal(best, []string{"a-a2", "b-b1"}) {
		t.Fatalf("ids = %v, best = %v", ids, best)
	}
	for _, c := range []struct {
		list, device string
		want         []string
	}{
		{"a", "", []string{"a-a2", "a-a1", "a-@" + at(27, 8)}},
		{"", "mac", []string{"a-a2", "a-a1"}},
		{"", "none", []string{"b-b1", "a-@" + at(27, 8)}},
		{"b", "mac", nil},
		{"missing", "", nil},
	} {
		if got, _ := feedIDs(Feed(lists, c.list, c.device)); !slices.Equal(got, c.want) {
			t.Errorf("list %q device %q = %v, want %v", c.list, c.device, got, c.want)
		}
	}
}

// The case of tests/records.test.cjs: each mode has its own best.
func TestFeedBestPerMode(t *testing.T) {
	list := List{ID: "l", Words: make([]Word, 1), Records: []Record{practice("a", 10, number(100), 1, 20, nil),
		practice("bb", 12, number(100), 1, 21, nil), practice("ccc", 5, number(100), 1, 22, nil)}}
	list.Records[2].Mode = "writing"
	got := map[string]bool{}
	for _, row := range Feed([]List{list}, "", "") {
		got[*row.Record.ID] = row.Best
	}
	if !got["a"] || got["bb"] || !got["ccc"] {
		t.Fatalf("best = %v", got)
	}
}
