package workspace

import (
	"cmp"
	"slices"
	"time"
)

const (
	// A best set within this many days, beating an earlier run, is marked as improved.
	improvedDays = 7
	recentRuns   = 5
	trendPoints  = 20
)

// WordCountGroup counts a list's records at a word count other than its current one; WordCount is nil for records
// saved before word counts were.
type WordCountGroup struct {
	WordCount *int `json:"wordCount"`
	Count     int  `json:"count"`
}

// Ranking is a list's ranking on the ベスト記録 screen, as listRanking (src/core/rankings.ts).
type Ranking struct {
	List *List
	// Records are the list's records on the chosen device, at any word count.
	Records []Record
	Ranked  []Record
	// Others are records at another word count than the list has now; they are ranked only when asked for, or when
	// nothing else exists (Fallback).
	Others        []Record
	OtherCounts   []WordCountGroup
	Fallback      bool
	Best          *Record
	LastPracticed *time.Time
	Improved      bool
}

func onDevice(record *Record, device string) bool {
	switch device {
	case "":
		return true
	case NoDevice:
		return record.Device == nil
	}
	return record.Device != nil && record.Device.ID == device
}

// ListRanking ranks a list's records on device ("" for all, NoDevice for none) by order, as listRanking does.
func ListRanking(list *List, device, order string, includeOthers bool, now time.Time) Ranking {
	records := []*Record{}
	for i := range list.Records {
		if list.Records[i].Mode == "" && onDevice(&list.Records[i], device) {
			records = append(records, &list.Records[i])
		}
	}
	others := slices.DeleteFunc(slices.Clone(records), func(r *Record) bool { return r.WordCount != nil && *r.WordCount == len(list.Words) })
	candidates := records
	if !includeOthers {
		candidates = comparable(list, records)
	}
	ranked := rank(candidates, order)
	ranking := Ranking{List: list, Records: values(records), Ranked: values(ranked), Others: values(others),
		OtherCounts: []WordCountGroup{}, Fallback: len(others) > 0 && len(others) == len(records), LastPracticed: lastPracticed(values(records))}
	for _, r := range others {
		i := slices.IndexFunc(ranking.OtherCounts, func(g WordCountGroup) bool {
			return (g.WordCount == nil && r.WordCount == nil) || (g.WordCount != nil && r.WordCount != nil && *g.WordCount == *r.WordCount)
		})
		if i < 0 {
			ranking.OtherCounts = append(ranking.OtherCounts, WordCountGroup{WordCount: r.WordCount})
			i = len(ranking.OtherCounts) - 1
		}
		ranking.OtherCounts[i].Count++
	}
	// Most words first; records without a word count last.
	slices.SortStableFunc(ranking.OtherCounts, func(a, b WordCountGroup) int { return cmp.Compare(wordCountOf(b), wordCountOf(a)) })
	if len(ranked) > 0 {
		best := *ranked[0]
		ranking.Best = &best
		ranking.Improved = now.Sub(best.At) < improvedDays*24*time.Hour &&
			slices.ContainsFunc(ranked, func(r *Record) bool { return r.At.Before(best.At) })
	}
	return ranking
}

func wordCountOf(g WordCountGroup) int {
	if g.WordCount == nil {
		return -1
	}
	return *g.WordCount
}

func values(records []*Record) []Record {
	out := make([]Record, 0, len(records))
	for _, r := range records {
		out = append(out, *r)
	}
	return out
}

// SortRankings orders as sortRankings does: recent (last practised first), name (localeCompare(…, 'ja')) or count
// (most records first, then recent). It reports false for a sort it does not know.
func SortRankings(rankings []Ranking, sort string) ([]Ranking, bool) {
	practised := func(r Ranking) int64 {
		if r.LastPracticed == nil {
			return 0
		}
		return r.LastPracticed.UnixMilli()
	}
	recent := func(a, b Ranking) int { return cmp.Compare(practised(b), practised(a)) }
	var compare func(a, b Ranking) int
	switch sort {
	case "recent":
		compare = recent
	case "name":
		compare = func(a, b Ranking) int { return CompareNames(a.List.Name, b.List.Name, false) }
	case "count":
		compare = func(a, b Ranking) int { return cmp.Or(cmp.Compare(len(b.Records), len(a.Records)), recent(a, b)) }
	default:
		return nil, false
	}
	sorted := slices.Clone(rankings)
	slices.SortStableFunc(sorted, compare)
	return sorted, true
}

// Point is a run's time on the ranking's chart.
type Point struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

// RankingStats are the figures above the ranking, as rankingStats: the average time and accuracy of the latest five
// runs, and the times of the latest twenty, oldest first.
type RankingStats struct {
	RecentCount    int      `json:"recentCount"`
	RecentTime     *float64 `json:"recentTime"`
	RecentAccuracy *float64 `json:"recentAccuracy"`
	Points         []Point  `json:"points"`
}

func Stats(ranked []Record) RankingStats {
	byDate := slices.Clone(ranked)
	slices.SortStableFunc(byDate, func(a, b Record) int { return a.At.Compare(b.At) })
	recent := byDate[max(0, len(byDate)-recentRuns):]
	stats := RankingStats{RecentCount: len(recent), Points: []Point{}}
	if len(recent) > 0 {
		total := 0.0
		for _, r := range recent {
			total += r.Time
		}
		average := total / float64(len(recent))
		stats.RecentTime = &average
	}
	accuracies := []float64{}
	for _, r := range recent {
		if r.Accuracy != nil {
			accuracies = append(accuracies, *r.Accuracy)
		}
	}
	if len(accuracies) > 0 {
		total := 0.0
		for _, a := range accuracies {
			total += a
		}
		average := total / float64(len(accuracies))
		stats.RecentAccuracy = &average
	}
	for _, r := range byDate[max(0, len(byDate)-trendPoints):] {
		stats.Points = append(stats.Points, Point{Date: r.Date, Value: r.Time})
	}
	return stats
}
