package workspace

import (
	"slices"
	"testing"
	"time"
)

func dated(date string, wordCount int) Record {
	at, _ := ParseTime(date)
	record := Record{Time: 5, Date: date, At: at}
	if wordCount > 0 {
		record.WordCount = &wordCount
	}
	return record
}

func overviewLists() []List {
	ws := func(texts ...string) []Word {
		out := []Word{}
		for _, text := range texts {
			out = append(out, Word{Display: text, Input: lowerCase(text)})
		}
		return out
	}
	return []List{
		{ID: "a", Name: "Test 10", Words: ws("あ", "い"), Records: []Record{dated("2026-09-20T10:00:00Z", 2), dated("2026-09-28T10:00:00Z", 2)}},
		{ID: "b", Name: "Test 2", Words: ws("Apple", "Banana", "Cherry"), Records: []Record{}},
		{ID: "c", Name: "英単語", Words: ws("kiwi"), Records: []Record{dated("2026-09-29T08:00:00Z", 1)}},
	}
}

// The cases of tests/listOverview.test.cjs.
func TestOverviews(t *testing.T) {
	items := Overviews(overviewLists())
	if items[0].Position != 0 || items[0].PracticeCount != 2 || !items[0].LastPracticed.Equal(time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("a = %+v", items[0])
	}
	if items[1].PracticeCount != 0 || items[1].LastPracticed != nil {
		t.Fatalf("b = %+v", items[1])
	}
}

func TestSortOverviews(t *testing.T) {
	items := Overviews(overviewLists())
	ids := func(order string) []string {
		sorted, ok := SortOverviews(items, order)
		if !ok {
			t.Fatalf("order %q refused", order)
		}
		out := []string{}
		for _, item := range sorted {
			out = append(out, item.List.ID)
		}
		return out
	}
	for order, want := range map[string][]string{"added": {"c", "b", "a"}, "practiced": {"c", "a", "b"}, "name": {"b", "a", "c"}, "words": {"b", "a", "c"}} {
		if got := ids(order); !slices.Equal(got, want) {
			t.Errorf("%s = %v, want %v", order, got, want)
		}
	}
	if items[0].List.ID != "a" || items[2].List.ID != "c" {
		t.Fatal("sorting changed the saved order")
	}
	if _, ok := SortOverviews(items, "bad"); ok {
		t.Fatal("accepted an unknown order")
	}
}

func TestMatchesQuery(t *testing.T) {
	lists := overviewLists()
	if !MatchesQuery(&lists[1], "banana") || !MatchesQuery(&lists[1], "TEST") || !MatchesQuery(&lists[2], "KIWI") ||
		MatchesQuery(&lists[0], "kiwi") || !MatchesQuery(&lists[0], "  ") {
		t.Fatal("MatchesQuery")
	}
}

func TestCurrentRecordCount(t *testing.T) {
	list := List{Words: []Word{{}, {}, {}}, Records: []Record{dated("2026-09-01", 3), dated("2026-09-02", 2), dated("2026-09-03", 0)}}
	if got := CurrentRecordCount(&list); got != 1 {
		t.Fatalf("CurrentRecordCount = %d", got)
	}
}

func TestCompareNames(t *testing.T) {
	if CompareNames("List 2", "List 10", true) >= 0 || CompareNames("List 10", "List 2", false) >= 0 {
		t.Fatal("numeric order")
	}
	if CompareNames("あ", "い", true) >= 0 || CompareNames("a", "B", true) >= 0 || CompareNames("x", "x", false) != 0 {
		t.Fatal("order")
	}
}
