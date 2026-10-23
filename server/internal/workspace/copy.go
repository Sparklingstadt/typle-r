package workspace

import (
	"fmt"
	"slices"
	"time"
	"unicode/utf16"
)

// copyMark is the app's page.copySuffix in its base language: （コピー） for the first copy, （コピー2） and so on after.
func copyMark(n int) string {
	if n == 1 {
		return "（コピー）"
	}
	return fmt.Sprintf("（コピー%d）", n)
}

// copyName follows copyName (src/core/listOverview.ts): the name with the first mark that no list uses, cut so that
// the whole stays within MaxListName. A character of two UTF-16 units is never cut in half.
func copyName(w *Workspace, name string) string {
	taken := map[string]bool{}
	for _, list := range w.Lists {
		taken[lowerCase(trimJS(list.Name))] = true
	}
	base := utf16.Encode([]rune(trimJS(name)))
	for n := 1; ; n++ {
		mark := copyMark(n)
		keep := min(len(base), MaxListName-length(mark))
		if keep > 0 && utf16.IsSurrogate(rune(base[keep-1])) && base[keep-1] < 0xdc00 {
			keep--
		}
		candidate := string(utf16.Decode(base[:keep])) + mark
		if !taken[lowerCase(candidate)] {
			return candidate
		}
	}
}

// CopyList follows duplicateList (src/core/listOverview.ts): a new list after the others with the same category, tags
// and words (and their fields Typle does not know) and no records. Without a name, the copy is named by copyName.
func CopyList(w *Workspace, sourceID string, name *string, id string, now time.Time) (*List, error) {
	at := index(w, sourceID)
	if at < 0 {
		return nil, missing()
	}
	if len(w.Lists) >= MaxLists {
		return nil, &Error{Key: "listLimit"}
	}
	source := &w.Lists[at]
	if name == nil {
		generated := copyName(w, source.Name)
		name = &generated
	}
	tags := slices.Clone(source.Tags)
	return CreateList(w, ListInput{Name: name, Category: &source.Category, Tags: &tags, Words: slices.Clone(source.Words)}, id, now)
}
