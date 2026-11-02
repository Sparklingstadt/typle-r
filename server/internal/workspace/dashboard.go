package workspace

import (
	"cmp"
	"math"
	"slices"
	"time"
)

// The ホーム dashboard, as summarize, nextLists and listTrends (src/core/dashboard.ts) compute it. Records store UTC
// times; every day and week boundary follows the calendar of now's location, as the app's follows the browser's.

const (
	staleDays   = 3
	lowAccuracy = 90
)

// localTime is the time at this wall clock in loc, as JavaScript's Date reads it. A wall clock that a change of offset
// skips is read with the offset from before the change, so it lands after the change (Go's time.Date lands before it,
// on the day before when the change skips midnight), and one that happens twice is the first.
func localTime(year int, month time.Month, day, hour, minute, second, nanosecond int, loc *time.Location) time.Time {
	t := time.Date(year, month, day, hour, minute, second, nanosecond, loc)
	wall := time.Date(year, month, day, hour, minute, second, nanosecond, time.UTC)
	at := func(t time.Time) time.Time {
		_, offset := t.Zone()
		return wall.Add(-time.Duration(offset) * time.Second).In(loc)
	}
	if !wallClock(t).Equal(wall) {
		return at(t)
	}
	if start, _ := t.ZoneBounds(); !start.IsZero() {
		if earlier := at(start.Add(-time.Nanosecond)); earlier.Before(start) && wallClock(earlier).Equal(wall) {
			return earlier
		}
	}
	return t
}

// wallClock is the date and time t shows, as a time in UTC.
func wallClock(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), time.UTC)
}

func startOfDay(t time.Time) time.Time {
	year, month, day := t.Date()
	return localTime(year, month, day, 0, 0, 0, 0, t.Location())
}

// addDays moves by calendar days, keeping the time of day across a change to or from summer time, as setDate does.
func addDays(t time.Time, days int) time.Time {
	year, month, day := t.Date()
	hour, minute, second := t.Clock()
	return localTime(year, month, day+days, hour, minute, second, t.Nanosecond(), t.Location())
}

func startOfWeek(t time.Time) time.Time {
	day := startOfDay(t)
	return addDays(day, -((int(day.Weekday()) + 6) % 7))
}

type dayKey struct {
	year  int
	month time.Month
	day   int
}

func keyOf(t time.Time) dayKey {
	year, month, day := t.Date()
	return dayKey{year, month, day}
}

// daysBetween counts calendar days in to's location, rounding a day of 23 or 25 hours as Math.round does.
func daysBetween(from, to time.Time) int {
	hours := startOfDay(to).Sub(startOfDay(from.In(to.Location()))).Hours()
	return int(math.Floor(hours/24 + 0.5))
}

// newestFirst orders records by date, newest first, keeping the stored order of equal dates.
func newestFirst(records []Record) []Record {
	sorted := slices.Clone(records)
	slices.SortStableFunc(sorted, func(a, b Record) int { return cmp.Compare(b.At.UnixMilli(), a.At.UnixMilli()) })
	return sorted
}

func average(values []float64) float64 {
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func accuracies(records []Record) []float64 {
	values := []float64{}
	for _, record := range records {
		if record.Accuracy != nil {
			values = append(values, *record.Accuracy)
		}
	}
	return values
}

// Change compares the average of the newest values with the average of the ones before them.
type Change struct {
	Recent        float64 `json:"recent"`
	RecentCount   int     `json:"recentCount"`
	Previous      float64 `json:"previous"`
	PreviousCount int     `json:"previousCount"`
}

func change(newest []float64, recentCount, previousCount int) *Change {
	if recentCount == 0 || previousCount == 0 {
		return nil
	}
	return &Change{Recent: average(newest[:recentCount]), RecentCount: recentCount,
		Previous: average(newest[recentCount : recentCount+previousCount]), PreviousCount: previousCount}
}

type AccuracySummary struct {
	Recent      float64 `json:"recent"`
	RecentCount int     `json:"recentCount"`
	Change      *Change `json:"change"`
}

type Summary struct {
	WeekStart           time.Time
	WeekCount           int
	PreviousWeekCount   int
	WeekSeconds         float64
	PreviousWeekSeconds float64
	Streak              int
	PracticedToday      bool
	Accuracy            *AccuracySummary
}

// Summarize counts this week's runs against last week's up to the same moment, the days in a row with practice, and
// the accuracy of the latest ten runs against the ten before.
func Summarize(lists []List, now time.Time) Summary {
	var records []Record
	for _, list := range lists {
		records = append(records, typingRecords(list.Records)...)
	}
	weekStart := startOfWeek(now)
	between := func(from, to time.Time) (count int, seconds float64) {
		for _, record := range records {
			if at := record.At.UnixMilli(); at >= from.UnixMilli() && at <= to.UnixMilli() {
				count++
				seconds += record.Time
			}
		}
		return count, seconds
	}
	summary := Summary{WeekStart: weekStart}
	summary.WeekCount, summary.WeekSeconds = between(weekStart, addDays(weekStart, 7).Add(-time.Millisecond))
	// Compare against the same point of last week so Monday is not measured against a whole week.
	summary.PreviousWeekCount, summary.PreviousWeekSeconds = between(addDays(weekStart, -7), addDays(now, -7))
	days := map[dayKey]bool{}
	for _, record := range records {
		days[keyOf(record.At.In(now.Location()))] = true
	}
	today := startOfDay(now)
	summary.PracticedToday = days[keyOf(today)]
	day := today
	if !summary.PracticedToday {
		day = addDays(today, -1)
	}
	for ; days[keyOf(day)]; day = addDays(day, -1) {
		summary.Streak++
	}
	newest := accuracies(newestFirst(records))
	if recentCount := min(10, len(newest)); recentCount > 0 {
		summary.Accuracy = &AccuracySummary{Recent: average(newest[:recentCount]), RecentCount: recentCount,
			Change: change(newest, recentCount, min(10, len(newest)-recentCount))}
	}
	return summary
}

// Reason is why a list is suggested: new (never practised), stale (Days since the last run) or accuracy (the average
// Accuracy of the latest Count runs is low).
type Reason struct {
	Kind     string   `json:"kind"`
	Days     *int     `json:"days,omitempty"`
	Accuracy *float64 `json:"accuracy,omitempty"`
	Count    *int     `json:"count,omitempty"`
}

type NextList struct {
	List          *List
	LastPracticed *time.Time
	Reason        Reason
}

// NextLists suggests up to limit lists to practise, taking new, neglected and inaccurate lists in turn.
func NextLists(lists []List, now time.Time, limit int) []NextList {
	var groups [3][]NextList
	for i := range lists {
		list := &lists[i]
		records := newestFirst(typingRecords(list.Records))
		if len(records) == 0 {
			groups[0] = append(groups[0], NextList{List: list, Reason: Reason{Kind: "new"}})
			continue
		}
		last := records[0].At
		if days := daysBetween(last, now); days >= staleDays {
			groups[1] = append(groups[1], NextList{List: list, LastPracticed: &last, Reason: Reason{Kind: "stale", Days: &days}})
			continue
		}
		recent := accuracies(records)
		recent = recent[:min(5, len(recent))]
		if len(recent) > 0 && average(recent) < lowAccuracy {
			accuracy, count := average(recent), len(recent)
			groups[2] = append(groups[2], NextList{List: list, LastPracticed: &last,
				Reason: Reason{Kind: "accuracy", Accuracy: &accuracy, Count: &count}})
		}
	}
	slices.SortStableFunc(groups[1], func(a, b NextList) int { return *b.Reason.Days - *a.Reason.Days })
	slices.SortStableFunc(groups[2], func(a, b NextList) int { return cmp.Compare(*a.Reason.Accuracy, *b.Reason.Accuracy) })
	// Take from each reason in turn so a pile of unused lists never hides neglected or weak ones.
	picked := []NextList{}
	for index := 0; len(picked) < limit; index++ {
		left := false
		for _, group := range groups {
			if index < len(group) {
				left = true
				if len(picked) < limit {
					picked = append(picked, group[index])
				}
			}
		}
		if !left {
			break
		}
	}
	return picked
}

type Trend struct {
	Points []Point `json:"points"`
	Change *Change `json:"change"`
}

type ListTrend struct {
	List          *List
	Count         int
	LastPracticed time.Time
	Speed         Trend
	Accuracy      Trend
	Best          *Record
}

// trend keeps the latest twenty points and compares the newest half (up to five) with as many before them.
func trend(points []Point) Trend {
	newest := make([]float64, len(points))
	for i, point := range points {
		newest[len(points)-1-i] = point.Value
	}
	recentCount := min(5, (len(newest)+1)/2)
	return Trend{Points: points[max(0, len(points)-trendPoints):], Change: change(newest, recentCount, min(5, len(newest)-recentCount))}
}

// ListTrends answers each practised list's speed (seconds per word) and accuracy over time, the list practised last
// first.
func ListTrends(lists []List) []ListTrend {
	trends := []ListTrend{}
	for i := range lists {
		list := &lists[i]
		typing := typingRecords(list.Records)
		if len(typing) == 0 {
			continue
		}
		records := newestFirst(typing)
		slices.Reverse(records)
		speed, accuracy := []Point{}, []Point{}
		for _, record := range records {
			// Seconds per word stays comparable after words are added to or removed from a list.
			if record.WordCount != nil {
				speed = append(speed, Point{Date: record.Date, Value: record.Time / float64(*record.WordCount)})
			}
			if record.Accuracy != nil {
				accuracy = append(accuracy, Point{Date: record.Date, Value: *record.Accuracy})
			}
		}
		trends = append(trends, ListTrend{List: list, Count: len(records), LastPracticed: records[len(records)-1].At,
			Speed: trend(speed), Accuracy: trend(accuracy), Best: ListBest(&List{Words: list.Words, Records: typing})})
	}
	slices.SortStableFunc(trends, func(a, b ListTrend) int { return cmp.Compare(b.LastPracticed.UnixMilli(), a.LastPracticed.UnixMilli()) })
	return trends
}
