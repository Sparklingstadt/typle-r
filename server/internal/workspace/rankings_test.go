package workspace

import (
	"fmt"
	"slices"
	"testing"
	"time"
)

var rankingNow = time.Date(2026, 9, 29, 13, 0, 0, 0, time.UTC)

// The cases of tests/rankings.test.cjs.
func TestListRanking(t *testing.T) {
	list := edited()
	r := ListRanking(&list, "", "accuracy", "", false, rankingNow)
	if got := ids(r.Ranked); !slices.Equal(got, []string{"new2", "new3", "new1"}) || *r.Best.ID != "new2" || r.Fallback || len(r.Records) != 6 {
		t.Fatalf("ranking = %v best %v fallback %v records %d", got, r.Best, r.Fallback, len(r.Records))
	}
	if got := fmt.Sprint(groups(r.OtherCounts)); got != "[10:2 nil:1]" {
		t.Fatalf("otherCounts = %s", got)
	}
	if !r.LastPracticed.Equal(time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("lastPracticed = %v", r.LastPracticed)
	}
	all := ListRanking(&list, "", "accuracy", "", true, rankingNow)
	if got := ids(all.Ranked); !slices.Equal(got, []string{"old1", "new2", "new3", "old2", "new1", "legacy"}) {
		t.Fatalf("all = %v", got)
	}
	if got := ids(ListRanking(&list, "", "speed", "", false, rankingNow).Ranked); !slices.Equal(got, []string{"new2", "new1", "new3"}) {
		t.Fatalf("speed = %v", got)
	}
}

func groups(counts []WordCountGroup) []string {
	out := []string{}
	for _, g := range counts {
		if g.WordCount == nil {
			out = append(out, fmt.Sprintf("nil:%d", g.Count))
		} else {
			out = append(out, fmt.Sprintf("%d:%d", *g.WordCount, g.Count))
		}
	}
	return out
}

func TestListRankingByDevice(t *testing.T) {
	list := edited()
	onPad := ListRanking(&list, "pad", "accuracy", "", false, rankingNow)
	if got := ids(onPad.Ranked); !slices.Equal(got, []string{"new2"}) || fmt.Sprint(groups(onPad.OtherCounts)) != "[10:1]" {
		t.Fatalf("pad = %v %v", got, groups(onPad.OtherCounts))
	}
	noDevice := ListRanking(&list, NoDevice, "accuracy", "", false, rankingNow)
	if !noDevice.Fallback || !slices.Equal(ids(noDevice.Ranked), []string{"legacy"}) {
		t.Fatalf("none = %+v", noDevice)
	}
	missing := ListRanking(&list, "gone", "accuracy", "", false, rankingNow)
	if len(missing.Ranked) != 0 || missing.Fallback || missing.LastPracticed != nil || missing.Improved || missing.Best != nil {
		t.Fatalf("missing = %+v", missing)
	}
}

func TestImproved(t *testing.T) {
	list := edited()
	if !ListRanking(&list, "", "accuracy", "", false, rankingNow).Improved {
		t.Fatal("a recent best that beat an earlier run is improved")
	}
	if ListRanking(&list, "", "accuracy", "", false, time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)).Improved {
		t.Fatal("older than 7 days")
	}
	first := List{Words: make([]Word, 12), Records: []Record{practice("only", 14, number(100), 12, 29, nil)}}
	if ListRanking(&first, "", "accuracy", "", false, rankingNow).Improved {
		t.Fatal("the first run is not an improvement")
	}
}

func TestSortRankings(t *testing.T) {
	a := List{ID: "a", Name: "いろは", Words: make([]Word, 1), Records: []Record{practice("a1", 5, number(100), 1, 20, nil)}}
	b := List{ID: "b", Name: "あいう", Words: make([]Word, 1), Records: []Record{practice("b1", 5, number(100), 1, 28, nil)}}
	c := List{ID: "c", Name: "Count", Words: make([]Word, 1), Records: []Record{practice("c1", 5, number(100), 1, 10, nil), practice("c2", 5, number(100), 1, 11, nil)}}
	rankings := []Ranking{ListRanking(&a, "", "", "", false, rankingNow), ListRanking(&b, "", "", "", false, rankingNow), ListRanking(&c, "", "", "", false, rankingNow)}
	for sort, want := range map[string][]string{"recent": {"b", "a", "c"}, "name": {"c", "b", "a"}, "count": {"c", "b", "a"}} {
		sorted, ok := SortRankings(rankings, sort)
		got := []string{}
		for _, r := range sorted {
			got = append(got, r.List.ID)
		}
		if !ok || !slices.Equal(got, want) {
			t.Errorf("%s = %v, want %v", sort, got, want)
		}
	}
	if _, ok := SortRankings(rankings, "bad"); ok {
		t.Fatal("accepted an unknown sort")
	}
}

// Rankings compare names as localeCompare(…, 'ja') does: digits as characters, so List 10 comes before List 2.
func TestSortRankingsByName(t *testing.T) {
	two, ten := List{ID: "2", Name: "List 2"}, List{ID: "10", Name: "List 10"}
	sorted, _ := SortRankings([]Ranking{ListRanking(&two, "", "", "", false, rankingNow), ListRanking(&ten, "", "", "", false, rankingNow)}, "name")
	if sorted[0].List.ID != "10" {
		t.Fatalf("first = %s", sorted[0].List.ID)
	}
}

func TestStats(t *testing.T) {
	records := []Record{}
	for i := range 25 {
		accuracy := 90.0
		if i%2 == 1 {
			accuracy = 100
		}
		r := practice(fmt.Sprintf("r%d", i), float64(30-i), &accuracy, 5, 1, nil)
		r.At = time.Date(2026, 9, 1+i, 12, 0, 0, 0, time.UTC)
		r.Date = FormatTime(r.At)
		records = append(records, r)
	}
	stats := Stats(RankRecords(records, "accuracy"))
	if stats.RecentCount != 5 || *stats.RecentTime != 8 || *stats.RecentAccuracy != 94 || len(stats.Points) != 20 ||
		stats.Points[0].Value != 25 || stats.Points[19].Value != 6 {
		t.Fatalf("stats = %+v", stats)
	}
	legacy := Stats([]Record{practice("x", 10, nil, 5, 1, nil)})
	if *legacy.RecentTime != 10 || legacy.RecentAccuracy != nil || len(legacy.Points) != 1 {
		t.Fatalf("legacy = %+v", legacy)
	}
	empty := Stats(nil)
	if empty.RecentCount != 0 || empty.RecentTime != nil || empty.RecentAccuracy != nil || empty.Points == nil || len(empty.Points) != 0 {
		t.Fatalf("empty = %+v", empty)
	}
}

// Writing runs are ranked apart from normal runs (the case of tests/rankings.test.cjs).
func TestListRankingByMode(t *testing.T) {
	list := List{ID: "m", Words: make([]Word, 3), Records: []Record{
		practice("t1", 10, number(96), 3, 20, nil), practice("t2", 12, number(98), 3, 21, nil), practice("w1", 5, number(100), 3, 22, nil)}}
	list.Records[2].Mode = WritingMode
	normal := ListRanking(&list, "", "accuracy", "", false, rankingNow)
	if got := ids(normal.Ranked); !slices.Equal(got, []string{"t2", "t1"}) || *normal.Best.ID != "t2" {
		t.Fatalf("normal = %v", got)
	}
	writing := ListRanking(&list, "", "accuracy", WritingMode, false, rankingNow)
	if got := ids(writing.Ranked); !slices.Equal(got, []string{"w1"}) || len(writing.Records) != 1 {
		t.Fatalf("writing = %v records %d", got, len(writing.Records))
	}
}
