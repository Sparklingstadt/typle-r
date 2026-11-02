package workspace

import (
	"cmp"
	"slices"
)

// accuracyOf ranks a record without accuracy below every record with it, as `record.accuracy ?? -1` does in the app.
func accuracyOf(r *Record) float64 {
	if r.Accuracy == nil {
		return -1
	}
	return *r.Accuracy
}

// compareRuns orders as rankRecords (src/core/records.ts): accuracy first (higher, then faster), or speed first
// (faster, then higher accuracy).
func compareRuns(order string) func(a, b *Record) int {
	if order == "speed" {
		return func(a, b *Record) int {
			return cmp.Or(cmp.Compare(a.Time, b.Time), cmp.Compare(accuracyOf(b), accuracyOf(a)))
		}
	}
	return func(a, b *Record) int {
		return cmp.Or(cmp.Compare(accuracyOf(b), accuracyOf(a)), cmp.Compare(a.Time, b.Time))
	}
}

// rank orders pointers to records, keeping the stored order for ties.
func rank(records []*Record, order string) []*Record {
	ranked := slices.Clone(records)
	slices.SortStableFunc(ranked, compareRuns(order))
	return ranked
}

func pointers(records []Record) []*Record {
	out := make([]*Record, len(records))
	for i := range records {
		out[i] = &records[i]
	}
	return out
}

// RankRecords returns the records ranked by order (accuracy or speed), leaving records as they were.
func RankRecords(records []Record, order string) []Record {
	ranked := []Record{}
	for _, r := range rank(pointers(records), order) {
		ranked = append(ranked, *r)
	}
	return ranked
}

// comparable is comparableRecords (src/core/records.ts): editing a list changes the task, so only runs at its current
// word count are compared, and never a run practised in a mode (recall). With none of those, every normal record is.
func comparable(list *List, records []*Record) []*Record {
	return comparableOf(list, records, "")
}

// comparableOf is comparable for the records of one mode: "" for normal runs, RecallMode for recall runs.
func comparableOf(list *List, records []*Record, mode string) []*Record {
	records = slices.DeleteFunc(slices.Clone(records), func(r *Record) bool { return r.Mode != mode })
	same := slices.DeleteFunc(slices.Clone(records), func(r *Record) bool { return r.WordCount == nil || *r.WordCount != len(list.Words) })
	if len(same) > 0 {
		return same
	}
	return records
}

func ComparableRecords(list *List, records []Record) []Record {
	out := []Record{}
	for _, r := range comparable(list, pointers(records)) {
		out = append(out, *r)
	}
	return out
}

// ListBest is the record every screen shows as the list's best (listBest), pointing into list.Records; nil when the
// list has no record.
func ListBest(list *List) *Record {
	return ListBestOf(list, "")
}

// ListBestOf is listBest(list, mode): the best record among those of one mode, "" for normal runs or RecallMode.
func ListBestOf(list *List, mode string) *Record {
	ranked := rank(comparableOf(list, pointers(list.Records), mode), "accuracy")
	if len(ranked) == 0 {
		return nil
	}
	return ranked[0]
}
