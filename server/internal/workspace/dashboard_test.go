package workspace

import (
	"reflect"
	"testing"
	"time"
)

// The fixtures of tests/dashboard.test.cjs, which pins Asia/Tokyo.
var (
	tokyo, _ = time.LoadLocation("Asia/Tokyo")
	// Sunday 2026-09-27 21:00 JST
	dashNow = time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC).In(tokyo)
)

type dashOption func(*Record)

func withAccuracy(value *float64) dashOption { return func(r *Record) { r.Accuracy = value } }
func withWordCount(value int) dashOption     { return func(r *Record) { r.WordCount = &value } }

func dash(date string, seconds float64, options ...dashOption) Record {
	at, ok := ParseTime(date)
	if !ok {
		panic(date)
	}
	id, accuracy, wordCount, mistakes := date, 100.0, 2, 0
	record := Record{ID: &id, Date: date, Time: seconds, WordCount: &wordCount, Accuracy: &accuracy, Mistakes: &mistakes, At: at}
	for _, option := range options {
		option(&record)
	}
	return record
}

func dashList(id string, records ...Record) List {
	return List{ID: id, Name: id, CreatedAt: "2026-09-01", Words: []Word{{Display: "a", Input: "a"}, {Display: "b", Input: "b"}},
		Records: records}
}

func float(value float64) *float64 { return &value }

func TestWeeksStartOnLocalMonday(t *testing.T) {
	summary := Summarize(nil, dashNow)
	if got := FormatTime(summary.WeekStart); got != "2026-09-20T15:00:00.000Z" {
		t.Errorf("week start %s", got)
	}
	// 23:30 UTC on the 20th is already Monday 08:30 in Tokyo; 14:30 UTC is still Sunday there.
	summary = Summarize([]List{dashList("a", dash("2026-09-20T23:30:00Z", 10), dash("2026-09-20T14:30:00Z", 10))}, dashNow)
	if summary.WeekCount != 1 {
		t.Errorf("week count %d", summary.WeekCount)
	}
}

func TestSummaryDependsOnTZ(t *testing.T) {
	// Monday 08:00 in Tokyo is still Sunday 23:00 in UTC: this week in one, last week in the other.
	lists := []List{dashList("a", dash("2026-09-20T23:00:00Z", 10))}
	if got := Summarize(lists, dashNow).WeekCount; got != 1 {
		t.Errorf("Asia/Tokyo week count %d", got)
	}
	utc := Summarize(lists, dashNow.In(time.UTC))
	if utc.WeekCount != 0 || FormatTime(utc.WeekStart) != "2026-09-21T00:00:00.000Z" {
		t.Errorf("UTC week count %d from %s", utc.WeekCount, FormatTime(utc.WeekStart))
	}
}

func TestSummaryComparesSamePointOfLastWeek(t *testing.T) {
	summary := Summarize([]List{dashList("a",
		dash("2026-09-27T01:00:00Z", 30), dash("2026-09-26T01:00:00Z", 30), dash("2026-09-25T01:00:00Z", 30),
		dash("2026-09-23T01:00:00Z", 30),
		dash("2026-09-14T01:00:00Z", 20), dash("2026-09-20T13:00:00Z", 20),
	)}, dashNow)
	if summary.WeekCount != 4 || summary.WeekSeconds != 120 {
		t.Errorf("week %d, %v seconds", summary.WeekCount, summary.WeekSeconds)
	}
	// Sunday 22:00 JST last week is after "now minus 7 days", so it is left out of the comparison.
	if summary.PreviousWeekCount != 1 || summary.PreviousWeekSeconds != 20 {
		t.Errorf("previous week %d, %v seconds", summary.PreviousWeekCount, summary.PreviousWeekSeconds)
	}
	if summary.Streak != 3 || !summary.PracticedToday {
		t.Errorf("streak %d, today %v", summary.Streak, summary.PracticedToday)
	}
}

func TestStreakContinuesFromYesterday(t *testing.T) {
	summary := Summarize([]List{dashList("a", dash("2026-09-26T01:00:00Z", 10), dash("2026-09-25T01:00:00Z", 10))}, dashNow)
	if summary.PracticedToday || summary.Streak != 2 {
		t.Errorf("streak %d, today %v", summary.Streak, summary.PracticedToday)
	}
	if got := Summarize([]List{dashList("a", dash("2026-09-24T01:00:00Z", 10))}, dashNow).Streak; got != 0 {
		t.Errorf("broken streak %d", got)
	}
}

func TestAccuracyAveragesLatestTen(t *testing.T) {
	var records []Record
	for index := range 14 {
		accuracy := 90.0
		if index < 4 {
			accuracy = 80
		}
		records = append(records, dash(FormatTime(time.Date(2026, 9, 10+index, 0, 0, 0, 0, time.UTC)), 10, withAccuracy(&accuracy)))
	}
	records = append(records, dash("2026-09-26T00:00:00Z", 10, withAccuracy(nil)))
	accuracy := Summarize([]List{dashList("a", records...)}, dashNow).Accuracy
	if accuracy == nil || accuracy.RecentCount != 10 || accuracy.Recent != 90 {
		t.Fatalf("accuracy %+v", accuracy)
	}
	if accuracy.Change == nil || accuracy.Change.Previous != 80 || accuracy.Change.PreviousCount != 4 {
		t.Errorf("change %+v", accuracy.Change)
	}
	if got := Summarize([]List{dashList("a", dash("2026-09-26T00:00:00Z", 1, withAccuracy(nil)))}, dashNow).Accuracy; got != nil {
		t.Errorf("accuracy without accuracies %+v", got)
	}
}

func TestNextListsRotateThroughReasons(t *testing.T) {
	legacy := Record{Time: 5, Date: "2026/09/26 10:05"}
	legacy.At, _ = ParseTime(legacy.Date)
	lists := []List{
		dashList("new-1"), dashList("new-2"),
		dashList("stale-4", dash("2026-09-23T01:00:00Z", 10)), dashList("stale-9", dash("2026-09-18T01:00:00Z", 10)),
		dashList("weak", dash("2026-09-26T01:00:00Z", 10, withAccuracy(float(70))), dash("2026-09-10T01:00:00Z", 10, withAccuracy(float(100)))),
		dashList("fine", dash("2026-09-26T01:00:00Z", 10, withAccuracy(float(95)))),
		dashList("legacy", legacy),
	}
	names := func(picked []NextList) []string {
		out := []string{}
		for _, item := range picked {
			out = append(out, item.List.ID)
		}
		return out
	}
	picked := NextLists(lists, dashNow, 3)
	if got := names(picked); !reflect.DeepEqual(got, []string{"new-1", "stale-9", "weak"}) {
		t.Fatalf("picked %v", got)
	}
	if picked[0].LastPracticed != nil || !reflect.DeepEqual(picked[0].Reason, Reason{Kind: "new"}) {
		t.Errorf("new %+v", picked[0])
	}
	if days := 9; !reflect.DeepEqual(picked[1].Reason, Reason{Kind: "stale", Days: &days}) {
		t.Errorf("stale %+v", picked[1].Reason)
	}
	if count := 2; !reflect.DeepEqual(picked[2].Reason, Reason{Kind: "accuracy", Accuracy: float(85), Count: &count}) {
		t.Errorf("accuracy %+v", picked[2].Reason)
	}
	if got := names(NextLists(lists, dashNow, 6)); !reflect.DeepEqual(got, []string{"new-1", "stale-9", "weak", "new-2", "stale-4"}) {
		t.Errorf("six %v", got)
	}
	// Two calendar days, even though fewer than 48 hours have passed.
	if got := NextLists([]List{dashList("x", dash("2026-09-25T14:59:00Z", 10))}, dashNow, 3); len(got) != 0 {
		t.Errorf("two days %+v", got)
	}
	if got := NextLists([]List{dashList("x", dash("2026-09-24T14:59:00Z", 10))}, dashNow, 3); len(got) != 1 || *got[0].Reason.Days != 3 {
		t.Errorf("three days %+v", got)
	}
}

func TestTrendsUseSecondsPerWord(t *testing.T) {
	legacy := Record{Time: 9, Date: "2026-09-22T01:00:00Z"}
	legacy.At, _ = ParseTime(legacy.Date)
	trends := ListTrends([]List{
		dashList("older", dash("2026-09-20T01:00:00Z", 10)),
		dashList("recent",
			dash("2026-09-26T01:00:00Z", 8, withWordCount(4), withAccuracy(float(95))),
			dash("2026-09-24T01:00:00Z", 6, withWordCount(2), withAccuracy(float(90))),
			legacy,
			dash("2026-09-25T01:00:00Z", 5, withWordCount(2), withAccuracy(float(100))),
		),
		dashList("empty"),
	})
	if len(trends) != 2 || trends[0].List.ID != "recent" || trends[1].List.ID != "older" {
		t.Fatalf("trends %+v", trends)
	}
	recent := trends[0]
	values := func(points []Point) []float64 {
		out := []float64{}
		for _, point := range points {
			out = append(out, point.Value)
		}
		return out
	}
	if recent.Count != 4 || FormatTime(recent.LastPracticed) != "2026-09-26T01:00:00.000Z" {
		t.Errorf("count %d, last %s", recent.Count, FormatTime(recent.LastPracticed))
	}
	if got := values(recent.Speed.Points); !reflect.DeepEqual(got, []float64{3, 2.5, 2}) {
		t.Errorf("speed %v", got)
	}
	if got := values(recent.Accuracy.Points); !reflect.DeepEqual(got, []float64{90, 100, 95}) {
		t.Errorf("accuracy %v", got)
	}
	if want := (&Change{Recent: 2.25, RecentCount: 2, Previous: 3, PreviousCount: 1}); !reflect.DeepEqual(recent.Speed.Change, want) {
		t.Errorf("speed change %+v", recent.Speed.Change)
	}
	if recent.Best == nil || *recent.Best.Accuracy != 100 {
		t.Errorf("best %+v", recent.Best)
	}
	if trends[1].Speed.Change != nil {
		t.Errorf("one point change %+v", trends[1].Speed.Change)
	}
}

func TestTrendsKeepLatestTwentyPoints(t *testing.T) {
	var records []Record
	for index := range 25 {
		records = append(records, dash(FormatTime(time.Date(2026, 9, 1+index, 0, 0, 0, 0, time.UTC)), float64(index+1), withWordCount(1)))
	}
	trend := ListTrends([]List{dashList("a", records...)})[0]
	if len(trend.Speed.Points) != 20 || trend.Speed.Points[0].Value != 6 {
		t.Errorf("points %+v", trend.Speed.Points)
	}
	if want := (&Change{Recent: 23, RecentCount: 5, Previous: 18, PreviousCount: 5}); !reflect.DeepEqual(trend.Speed.Change, want) {
		t.Errorf("change %+v", trend.Speed.Change)
	}
}

func TestEmptyDashboard(t *testing.T) {
	summary := Summarize(nil, dashNow)
	if summary.WeekCount != 0 || summary.Streak != 0 || summary.PracticedToday || summary.Accuracy != nil {
		t.Errorf("summary %+v", summary)
	}
	if got := ListTrends(nil); got == nil || len(got) != 0 {
		t.Errorf("trends %#v", got)
	}
	if got := NextLists(nil, dashNow, 3); got == nil || len(got) != 0 {
		t.Errorf("next %#v", got)
	}
}

func TestDaysWhereClocksSkipMidnight(t *testing.T) {
	// Santiago moves from 00:00 to 01:00 on 2026-09-06; that day starts at 01:00 there, as in the browser.
	santiago, err := time.LoadLocation("America/Santiago")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 6, 12, 0, 0, 0, santiago)
	if got := FormatTime(startOfDay(now)); got != "2026-09-06T04:00:00.000Z" {
		t.Errorf("start of day %s", got)
	}
	summary := Summarize([]List{dashList("a", dash("2026-09-06T14:00:00Z", 10), dash("2026-09-05T14:00:00Z", 10))}, now)
	if !summary.PracticedToday || summary.Streak != 2 {
		t.Errorf("today %v, streak %d", summary.PracticedToday, summary.Streak)
	}
	// A day counted back onto the skipped midnight also starts at 01:00.
	if got := FormatTime(addDays(time.Date(2026, 9, 7, 0, 0, 0, 0, santiago), -1)); got != "2026-09-06T04:00:00.000Z" {
		t.Errorf("day before %s", got)
	}
}

func TestRepeatedWallClockIsTheEarlier(t *testing.T) {
	// Lord Howe goes back from 02:00 to 01:30 on 2026-04-05, so 01:45 happens twice; JavaScript takes the first.
	lordHowe, err := time.LoadLocation("Australia/Lord_Howe")
	if err != nil {
		t.Fatal(err)
	}
	if got := FormatTime(addDays(time.Date(2026, 4, 12, 1, 45, 0, 0, lordHowe), -7)); got != "2026-04-04T14:45:00.000Z" {
		t.Errorf("week before %s", got)
	}
}

// Writing runs are not counted (the case of tests/dashboard.test.cjs).
func TestDashboardIgnoresWriting(t *testing.T) {
	writing := dash("2026-09-26T10:00:00Z", 1)
	writing.Mode = "writing"
	mixed := dashList("mixed", dash("2026-09-21T10:00:00Z", 10), dash("2026-09-22T10:00:00Z", 12), writing)
	only := dashList("w", writing)
	if got := Summarize([]List{mixed}, dashNow).WeekCount; got != 2 {
		t.Fatalf("weekCount = %d", got)
	}
	picked := NextLists([]List{only}, dashNow, 3)
	if len(picked) != 1 || picked[0].Reason.Kind != "new" {
		t.Fatalf("next = %+v", picked)
	}
	if got := NextLists([]List{mixed}, dashNow, 3); len(got) == 0 || !got[0].LastPracticed.Equal(mixed.Records[1].At) {
		t.Fatalf("next = %+v", got)
	}
	trends := ListTrends([]List{mixed, only})
	if len(trends) != 1 || trends[0].Count != 2 || trends[0].Best.Time != 10 {
		t.Fatalf("trends = %+v", trends)
	}
}
