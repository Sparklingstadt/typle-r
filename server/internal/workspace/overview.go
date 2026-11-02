package workspace

import (
	"slices"
	"strings"
	"time"
)

// Overview is a list with what the list of word lists shows of it, as listOverviews (src/core/listOverview.ts).
type Overview struct {
	List *List
	// Position is the place in the saved order, which is the order the lists were added in.
	Position      int
	PracticeCount int
	LastPracticed *time.Time
}

func lastPracticed(records []Record) *time.Time {
	var last *time.Time
	for i := range records {
		if last == nil || records[i].At.After(*last) {
			at := records[i].At
			last = &at
		}
	}
	return last
}

func Overviews(lists []List) []Overview {
	items := make([]Overview, 0, len(lists))
	for i := range lists {
		items = append(items, Overview{List: &lists[i], Position: i, PracticeCount: len(lists[i].Records), LastPracticed: lastPracticed(lists[i].Records)})
	}
	return items
}

// SortOverviews orders as sortOverviews does: added (newest first), practiced (lists without a record last), name or
// words (most first). Ties keep the newest added first. It reports false for an order it does not know.
func SortOverviews(items []Overview, order string) ([]Overview, bool) {
	newer := func(a, b Overview) int { return b.Position - a.Position }
	var compare func(a, b Overview) int
	switch order {
	case "added":
		compare = newer
	case "practiced":
		compare = func(a, b Overview) int {
			switch {
			case a.LastPracticed == nil && b.LastPracticed == nil:
			case a.LastPracticed == nil:
				return 1
			case b.LastPracticed == nil:
				return -1
			default:
				if c := b.LastPracticed.Compare(*a.LastPracticed); c != 0 {
					return c
				}
			}
			return newer(a, b)
		}
	case "name":
		compare = func(a, b Overview) int {
			if c := CompareNames(a.List.Name, b.List.Name, true); c != 0 {
				return c
			}
			return newer(a, b)
		}
	case "words":
		compare = func(a, b Overview) int {
			if c := len(b.List.Words) - len(a.List.Words); c != 0 {
				return c
			}
			return newer(a, b)
		}
	default:
		return nil, false
	}
	sorted := slices.Clone(items)
	slices.SortStableFunc(sorted, compare)
	return sorted, true
}

// MatchesQuery finds a list by its name, category, one of its tags or one of its words, ignoring case, as matchesQuery
// does. A blank query matches every list.
func MatchesQuery(list *List, query string) bool {
	needle := lowerCase(trimJS(query))
	if needle == "" {
		return true
	}
	if strings.Contains(lowerCase(list.Name), needle) || strings.Contains(lowerCase(list.Category), needle) ||
		slices.ContainsFunc(list.Tags, func(tag string) bool { return strings.Contains(lowerCase(tag), needle) }) {
		return true
	}
	return slices.ContainsFunc(list.Words, func(word Word) bool {
		return strings.Contains(lowerCase(word.Display), needle) || strings.Contains(lowerCase(word.Input), needle)
	})
}

// MatchesFilter follows matchesFilter (src/core/listOverview.ts): the list has the category (when category is not nil;
// "" is no category) and every one of tags, ignoring case.
func MatchesFilter(list *List, category *string, tags []string) bool {
	key := func(value string) string { return lowerCase(trimJS(value)) }
	if category != nil && key(list.Category) != key(*category) {
		return false
	}
	return !slices.ContainsFunc(tags, func(tag string) bool {
		return !slices.ContainsFunc(list.Tags, func(own string) bool { return key(own) == key(tag) })
	})
}

// CurrentRecordCount counts the normal runs at the list's current word count, the ones its best is taken from.
func CurrentRecordCount(list *List) int {
	count := 0
	for _, record := range list.Records {
		if record.Mode == "" && record.WordCount != nil && *record.WordCount == len(list.Words) {
			count++
		}
	}
	return count
}
