package workspace

import (
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

// CompareNames orders names as the app does with Japanese collation: Intl.Collator('ja', { numeric: true }) for the
// list of word lists (numeric, so "List 2" comes before "List 10") and localeCompare(…, 'ja') for rankings.
func CompareNames(a, b string, numeric bool) int {
	options := []collate.Option{}
	if numeric {
		options = append(options, collate.Numeric)
	}
	// A Collator keeps a buffer, so it is not shared between goroutines.
	return collate.New(language.Japanese, options...).CompareString(a, b)
}
