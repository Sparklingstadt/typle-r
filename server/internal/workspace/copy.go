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

// copyName follows copyName (src/core/listOverview.ts) among the lists of w in the pack packID, or among all of them
// when packID is "".
func copyName(w *Workspace, name, packID string) string {
	names := make([]string, 0, len(w.Lists))
	for _, list := range w.Lists {
		if packID == "" || list.PackID == packID {
			names = append(names, list.Name)
		}
	}
	return copyNameAmong(names, name)
}

// copyNameAmong follows copyName (src/core/listOverview.ts): the name with the first mark that none of names uses, cut
// so that the whole stays within MaxListName (which is also MaxPackName). A character of two UTF-16 units is never cut
// in half.
func copyNameAmong(names []string, name string) string {
	taken := map[string]bool{}
	for _, other := range names {
		taken[lowerCase(trimJS(other))] = true
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

// CopyList follows duplicateList (src/core/listOverview.ts): a new list after the others with the same words (and
// their fields Typle does not know) and no records. A list of a pack is copied into that pack, named among its lists,
// and shows its labels; its levels are not copied. Without a name, the copy is named by copyName.
func CopyList(w *Workspace, sourceID string, name *string, id string, now time.Time) (*List, error) {
	at := index(w, sourceID)
	if at < 0 {
		return nil, missing()
	}
	if len(w.Lists) >= MaxLists {
		return nil, &Error{Key: "listLimit"}
	}
	source := &w.Lists[at]
	pack := findPack(w, source.PackID)
	if name == nil {
		packID := ""
		if pack != nil {
			packID = pack.ID
		}
		generated := copyName(w, source.Name, packID)
		name = &generated
	}
	words := slices.Clone(source.Words)
	if pack != nil {
		return CreateList(w, ListInput{Name: name, PackID: &pack.ID, Words: words}, id, now)
	}
	tags := slices.Clone(source.Tags)
	return CreateList(w, ListInput{Name: name, Category: &source.Category, Tags: &tags, Words: words}, id, now)
}
