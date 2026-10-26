package workspace

import (
	"slices"
	"strings"
	"testing"
)

func TestCopyList(t *testing.T) {
	w := two()
	w.Lists[0].Words[0].Extra = `{"reading":"アップル"}`
	w.Lists[0].Extra = `{"color":"red"}`
	list, err := CopyList(w, "l1", nil, "new", now)
	if err != nil {
		t.Fatal(err)
	}
	if list != &w.Lists[2] || list.ID != "new" || list.Name != "英単語（コピー）" || list.CreatedAt != "2026-10-20T00:00:00.000Z" ||
		list.Records == nil || len(list.Records) != 0 || list.Extra != "" {
		t.Fatalf("copy = %+v", list)
	}
	if len(list.Words) != 1 || list.Words[0] != w.Lists[0].Words[0] {
		t.Fatalf("words = %+v", list.Words)
	}
	// The copy has its own words: changing them leaves the source as it was.
	list.Words[0].Display = "changed"
	if w.Lists[0].Words[0].Display != "apple" || len(w.Lists[0].Records) != 1 {
		t.Fatalf("source = %+v", w.Lists[0])
	}
}

func TestCopyNameSkipsTaken(t *testing.T) {
	w := two()
	w.Lists = append(w.Lists, List{ID: "c1", Name: "英単語（コピー）"})
	if got := copyName(w, "英単語", ""); got != "英単語（コピー2）" {
		t.Fatalf("copyName = %q", got)
	}
	w.Lists = append(w.Lists, List{ID: "c2", Name: " 英単語（コピー2） "})
	if got := copyName(w, " 英単語 ", ""); got != "英単語（コピー3）" {
		t.Fatalf("copyName = %q", got)
	}
	w.Lists = append(w.Lists, List{ID: "c3", Name: "abc（コピー）"})
	if got := copyName(w, "ABC", ""); got != "ABC（コピー2）" {
		t.Fatalf("copyName = %q", got)
	}
}

func TestCopyNameFitsLimit(t *testing.T) {
	w := two()
	if got := copyName(w, strings.Repeat("a", MaxListName), ""); got != strings.Repeat("a", MaxListName-5)+"（コピー）" || length(got) != MaxListName {
		t.Fatalf("copyName = %q (%d)", got, length(got))
	}
	// A character of two UTF-16 units is not cut in half.
	if got := copyName(w, strings.Repeat("𩸽", MaxListName/2), ""); length(got) > MaxListName || !strings.HasSuffix(got, "（コピー）") ||
		strings.ContainsRune(got, '�') {
		t.Fatalf("copyName = %q (%d)", got, length(got))
	}
}

func TestCopyListWithName(t *testing.T) {
	w := two()
	if list, err := CopyList(w, "l1", text(" 動物 "), "new", now); err != nil || list.Name != "動物" {
		t.Fatalf("copy = %+v, %v", list, err)
	}
	_, err := CopyList(w, "l1", text("fruits"), "n2", now)
	wantKey(t, err, "listNameDuplicate")
}

func TestCopyListErrors(t *testing.T) {
	w := two()
	_, err := CopyList(w, "missing", nil, "new", now)
	wantKey(t, err, "listNotFound")
	for len(w.Lists) < MaxLists {
		w.Lists = append(w.Lists, List{ID: NewID(), Name: NewID()})
	}
	_, err = CopyList(w, "l1", nil, "new", now)
	wantKey(t, err, "listLimit")
	if len(w.Lists) != MaxLists {
		t.Fatalf("lists = %d", len(w.Lists))
	}
}

// A list of a pack is copied into that pack, as duplicateList does: after every list (so last in the pack), named
// among the pack's lists, with its words and the pack's labels but no levels or records.
func TestCopyListStaysInItsPack(t *testing.T) {
	w := editLibrary()
	w.Lists[0].Words[0].Extra = `{"reading":"エルエス"}`
	// Another pack's list of the copy's name does not count.
	w.Lists[1].Name = "基本（コピー）"
	list, err := CopyList(w, "a", nil, "new", now)
	if err != nil {
		t.Fatal(err)
	}
	if list != &w.Lists[3] || list.ID != "new" || list.Name != "基本（コピー）" || list.PackID != "p" || list.Levels != nil ||
		list.Category != "C" || !slices.Equal(list.Tags, []string{"t"}) || len(list.Records) != 0 || list.Records == nil ||
		list.CreatedAt != "2026-10-20T00:00:00.000Z" {
		t.Fatalf("copy = %+v", list)
	}
	if len(list.Words) != 1 || list.Words[0] != w.Lists[0].Words[0] {
		t.Fatalf("words = %+v", list.Words)
	}
	if strings.Join(packIDs(w), ",") != "p,q" {
		t.Fatalf("packs = %v", packIDs(w))
	}
	valid(t, w)
	// Within the pack the name is taken now, so the next copy is （コピー2）; a name given is checked within the pack.
	if list, err := CopyList(w, "a", nil, "n2", now); err != nil || list.Name != "基本（コピー2）" || list.PackID != "p" {
		t.Fatalf("copy = %+v, %v", list, err)
	}
	_, err = CopyList(w, "a", text("応用"), "n3", now)
	wantKey(t, err, "listNameDuplicate")
	if list, err := CopyList(w, "a", text("Go"), "n4", now); err != nil || list.Name != "Go" || list.PackID != "p" {
		t.Fatalf("copy = %+v, %v", list, err)
	}
}
