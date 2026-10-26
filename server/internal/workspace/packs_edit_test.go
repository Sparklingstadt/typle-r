package workspace

import (
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// The cases follow tests/packFile.test.cjs and tests/packEditing.test.cjs.

const packStamp = "2026-10-01T00:00:00.000Z"

func packWordsOf(texts ...string) []Word {
	words := make([]Word, 0, len(texts))
	for _, text := range texts {
		words = append(words, Word{Display: text, Input: strings.ToLower(text)})
	}
	return words
}

// editLibrary is the library of tests/packFile.test.cjs: Linux (p) with 基本 and 応用 around Go (q) with its list Go.
func editLibrary() *Workspace {
	w := &Workspace{
		Packs: []Pack{
			{ID: "p", Name: "Linux", Description: "D", Category: "C", Tags: []string{"t"}, Origin: &Origin{CatalogID: "p", Version: 1},
				CreatedAt: packStamp},
			{ID: "q", Name: "Go", CreatedAt: packStamp},
		},
		Lists: []List{
			{ID: "a", Name: "基本", PackID: "p", Levels: []string{"基本"}, Words: packWordsOf("ls"),
				Records: []Record{{Time: 5, Date: "2026-10-05T00:00:00.000Z"}}, CreatedAt: packStamp},
			{ID: "g", Name: "Go", PackID: "q", Words: packWordsOf("go"), Records: []Record{}, CreatedAt: packStamp},
			{ID: "b", Name: "応用", PackID: "p", Levels: []string{"応用"}, Words: packWordsOf("grep"), Records: []Record{}, CreatedAt: packStamp},
		},
		Devices: []Device{},
	}
	viewLists(w)
	return w
}

// fullLibrary has MaxLists-extra lists, each in a pack of its own.
func fullLibrary(extra int) *Workspace {
	w := &Workspace{}
	for i := range MaxLists - extra {
		w.Packs = append(w.Packs, Pack{ID: fmt.Sprintf("p%d", i), Name: fmt.Sprintf("P%d", i), CreatedAt: packStamp})
		w.Lists = append(w.Lists, List{ID: fmt.Sprintf("l%d", i), Name: fmt.Sprintf("l%d", i), PackID: fmt.Sprintf("p%d", i),
			Words: packWordsOf("x"), Records: []Record{}, CreatedAt: packStamp})
	}
	return w
}

func listIDs(w *Workspace) []string {
	ids := make([]string, 0, len(w.Lists))
	for _, list := range w.Lists {
		ids = append(ids, list.ID)
	}
	return ids
}

func packIDs(w *Workspace) []string {
	ids := make([]string, 0, len(w.Packs))
	for _, pack := range w.Packs {
		ids = append(ids, pack.ID)
	}
	return ids
}

// valid fails unless w is a library the app can save, once its lists are in the saved shape.
func valid(t *testing.T, w *Workspace) {
	t.Helper()
	lists, _ := encodeBoth(t, w)
	if err := CheckPacks(w.Packs, stored(t, lists)); err != nil {
		t.Fatalf("CheckPacks: %v", err)
	}
}

// unchanged fails unless w encodes as before did.
func unchanged(t *testing.T, w *Workspace, before *Workspace) {
	t.Helper()
	lists, packs := encodeBoth(t, w)
	wantLists, wantPacks := encodeBoth(t, before)
	if string(lists) != string(wantLists) || string(packs) != string(wantPacks) {
		t.Fatalf("library changed:\n%s\n%s", lists, packs)
	}
}

func packFile(lists []PackFileList, pack PackFileInfo) *PackFile {
	return &PackFile{Format: "typle-pack", Version: 1, Pack: pack, Lists: lists}
}

func TestImportPackAddsAtTheEndTidied(t *testing.T) {
	w := editLibrary()
	file := packFile([]PackFileList{
		{Name: " One ", Levels: []string{" 初級 ", " "}, Words: []Word{{Display: " A ", Input: "a"}}},
		{Name: "Two", Levels: []string{"中級"}, Words: packWordsOf("B")},
	}, PackFileInfo{Name: " New ", Description: " ", Category: " c ", Tags: []string{"t", "T", " "}})
	pack, err := ImportPack(w, file, "n", []string{"n1", "n2"}, packNow)
	if err != nil {
		t.Fatal(err)
	}
	valid(t, w)
	want := Pack{ID: "n", Name: "New", Category: "c", Tags: []string{"t"}, CreatedAt: "2026-10-26T00:00:00.000Z"}
	if !reflect.DeepEqual(*pack, want) || !reflect.DeepEqual(w.Packs[2], want) {
		t.Fatalf("pack = %+v", *pack)
	}
	got := w.Lists[3:]
	wantLists := []List{
		{ID: "n1", Name: "One", Levels: []string{"初級"}, PackID: "n", Category: "c", Tags: []string{"t"},
			Words: []Word{{Display: " A ", Input: "a"}}, Records: []Record{}, CreatedAt: "2026-10-26T00:00:00.000Z"},
		{ID: "n2", Name: "Two", Levels: []string{"中級"}, PackID: "n", Category: "c", Tags: []string{"t"}, Words: packWordsOf("B"),
			Records: []Record{}, CreatedAt: "2026-10-26T00:00:00.000Z"},
	}
	if !reflect.DeepEqual(got, wantLists) {
		t.Fatalf("lists = %+v", got)
	}
	again := editLibrary()
	pack, err = ImportPack(again, packFile([]PackFileList{{Name: "L", Words: packWordsOf("a")}}, PackFileInfo{Name: " linux "}), "n",
		[]string{"n1"}, packNow)
	if err != nil || pack.Name != "linux（2）" {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
}

// The case of tests/packFile.test.cjs: a file written before v0.96.3 may repeat a level in a list, or overlap levels of
// its lists; the import tells them apart as reading saved data does, since the one who imports cannot change the file.
func TestImportPackTellsLevelsApart(t *testing.T) {
	w := editLibrary()
	_, err := ImportPack(w, packFile([]PackFileList{
		{Name: "A", Levels: []string{"基本", " 基本 "}, Words: packWordsOf("a")},
		{Name: "B", Levels: []string{"基本", "基本（2）"}, Words: packWordsOf("b")},
		{Name: "C", Words: packWordsOf("c")},
		{Name: "D", Levels: []string{"C"}, Words: packWordsOf("d")},
	}, PackFileInfo{Name: "Imported"}), "n", []string{"n1", "n2", "n3", "n4"}, packNow)
	if err != nil {
		t.Fatal(err)
	}
	valid(t, w)
	var got [][]string
	for _, list := range w.Lists[len(w.Lists)-4:] {
		got = append(got, list.Levels)
	}
	if want := [][]string{{"基本", "基本（2）"}, {"基本", "基本（2）（2）"}, nil, {"C（2）"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("levels = %q; want %q", got, want)
	}
}

func TestImportPackRefusesAgainstTheRulesOfASave(t *testing.T) {
	w := editLibrary()
	before := editLibrary()
	run := func(lists []PackFileList, pack PackFileInfo) error {
		ids := make([]string, len(lists))
		for n := range ids {
			ids[n] = fmt.Sprintf("n%d", n)
		}
		_, err := ImportPack(w, packFile(lists, pack), "n", ids, packNow)
		return err
	}
	name := PackFileInfo{Name: "Imported"}
	cases := []struct {
		lists []PackFileList
		pack  PackFileInfo
		key   string
	}{
		{[]PackFileList{{Name: "L", Words: packWordsOf("a")}, {Name: " l ", Words: packWordsOf("b")}}, name, "listNameDuplicate"},
		{[]PackFileList{{Name: " ", Words: packWordsOf("a")}}, name, "listNameRequired"},
		{[]PackFileList{{Name: "L", Words: []Word{}}}, name, "wordsRequired"},
		{[]PackFileList{{Name: "L", Words: []Word{{Display: "a", Input: " "}}}}, name, "wordFieldsRequired"},
		{[]PackFileList{{Name: "L", Words: packWordsOf("a")}}, PackFileInfo{Name: " "}, "packNameRequired"},
		{[]PackFileList{}, name, "packFileUnreadable"},
		{[]PackFileList{{Name: "L", Words: packWordsOf("a")}}, PackFileInfo{Name: strings.Repeat("x", 201)}, "invalidPack"},
		{[]PackFileList{{Name: "L", Words: packWordsOf("a")}}, PackFileInfo{Name: "P", Description: strings.Repeat("d", 501)}, "invalidPack"},
		{[]PackFileList{{Name: "L", Words: packWordsOf("a")}}, PackFileInfo{Name: "P", Category: strings.Repeat("c", 51)}, "invalidPack"},
		{[]PackFileList{{Name: "L", Words: packWordsOf("a")}}, PackFileInfo{Name: "P\x00"}, "invalidPack"},
		{[]PackFileList{{Name: "L", Levels: []string{"1", "2", "3", "4", "5", "6"}, Words: packWordsOf("a")}}, name, "invalidList"},
		{[]PackFileList{{Name: "L", Levels: []string{strings.Repeat("x", 51)}, Words: packWordsOf("a")}}, name, "invalidList"},
		{[]PackFileList{{Name: strings.Repeat("x", 201), Words: packWordsOf("a")}}, name, "invalidList"},
		{[]PackFileList{{Name: "L", Words: []Word{{Display: "a", Input: "a", Annotation: "\x00"}}}}, name, "invalidList"},
	}
	for _, c := range cases {
		wantKey(t, run(c.lists, c.pack), c.key)
	}
	unchanged(t, w, before)
	two := []PackFileList{{Name: "A", Words: packWordsOf("a")}, {Name: "B", Words: packWordsOf("b")}}
	full := fullLibrary(1)
	_, err := ImportPack(full, packFile(two, name), "n", []string{"n1", "n2"}, packNow)
	wantKey(t, err, "listLimit")
	full = fullLibrary(2)
	if _, err := ImportPack(full, packFile(two, name), "n", []string{"n1", "n2"}, packNow); err != nil || len(full.Lists) != MaxLists {
		t.Fatalf("lists = %d, %v", len(full.Lists), err)
	}
}

func TestCopyPackPutsTheCopyAfterItsSource(t *testing.T) {
	w := editLibrary()
	w.Packs[0].Extra = `{"memo":1}`
	w.Lists[0].Extra = `{"memo":2}`
	w.Lists[0].Words[0].Extra = `{"note":3}`
	pack, err := CopyPack(w, "p", nil, "c", []string{"c1", "c2"}, packNow)
	if err != nil {
		t.Fatal(err)
	}
	valid(t, w)
	if !slices.Equal(packIDs(w), []string{"p", "c", "q"}) || pack != &w.Packs[1] {
		t.Fatalf("packs = %v", packIDs(w))
	}
	want := Pack{ID: "c", Name: "Linux（コピー）", Description: "D", Category: "C", Tags: []string{"t"}, CreatedAt: "2026-10-26T00:00:00.000Z"}
	if !reflect.DeepEqual(w.Packs[1], want) {
		t.Fatalf("pack = %+v", w.Packs[1])
	}
	wantLists := []List{
		{ID: "c1", Name: "基本", Levels: []string{"基本"}, PackID: "c", Category: "C", Tags: []string{"t"}, Words: packWordsOf("ls"),
			Records: []Record{}, CreatedAt: "2026-10-26T00:00:00.000Z"},
		{ID: "c2", Name: "応用", Levels: []string{"応用"}, PackID: "c", Category: "C", Tags: []string{"t"}, Words: packWordsOf("grep"),
			Records: []Record{}, CreatedAt: "2026-10-26T00:00:00.000Z"},
	}
	if !reflect.DeepEqual(w.Lists[3:], wantLists) || !slices.Equal(listIDs(w)[:3], []string{"a", "g", "b"}) {
		t.Fatalf("lists = %+v", w.Lists)
	}
	if _, err := CopyPack(w, "p", nil, "d", []string{"d1", "d2"}, packNow); err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, pack := range w.Packs {
		names = append(names, pack.ID+":"+pack.Name)
	}
	if !slices.Equal(names, []string{"p:Linux", "d:Linux（コピー2）", "c:Linux（コピー）", "q:Go"}) {
		t.Fatalf("packs = %v", names)
	}
	_, err = CopyPack(editLibrary(), "missing", nil, "c", nil, packNow)
	wantKey(t, err, "packNotFound")
	full := fullLibrary(1)
	full.Lists[0].PackID = "p1"
	_, err = CopyPack(full, "p1", nil, "c", []string{"c1", "c2"}, packNow)
	wantKey(t, err, "listLimit")
}

func TestCopyPackWithName(t *testing.T) {
	w := editLibrary()
	pack, err := CopyPack(w, "p", text(" Mine "), "c", []string{"c1", "c2"}, packNow)
	if err != nil || pack.Name != "Mine" {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
	for name, key := range map[string]string{" go ": "packNameDuplicate", " ": "packNameRequired", strings.Repeat("x", 201): "invalidPack"} {
		_, err := CopyPack(w, "p", text(name), "d", []string{"d1", "d2"}, packNow)
		wantKey(t, err, key)
	}
}

func TestLongPackNamesKeepTheirMarksWithin200(t *testing.T) {
	long := strings.Repeat("x", 200)
	library := func() *Workspace {
		return &Workspace{Packs: []Pack{{ID: "p", Name: long, CreatedAt: packStamp}},
			Lists: []List{{ID: "a", Name: "A", PackID: "p", Words: packWordsOf("a"), Records: []Record{}, CreatedAt: packStamp}}}
	}
	pack, err := CopyPack(library(), "p", nil, "c", []string{"c1"}, packNow)
	if err != nil || pack.Name != strings.Repeat("x", 195)+"（コピー）" {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
	pack, err = ImportPack(library(), packFile([]PackFileList{{Name: "A", Words: packWordsOf("a")}}, PackFileInfo{Name: long}), "n",
		[]string{"n1"}, packNow)
	if err != nil || pack.Name != strings.Repeat("x", 197)+"（2）" {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
}

func packList(name string, levels ...string) PackListInput {
	list := PackListInput{Name: text(name), Words: packWordsOf("x")}
	if levels != nil {
		list.Levels = &levels
	}
	return list
}

func TestCreatePack(t *testing.T) {
	w := editLibrary()
	tags := []string{"t", "T"}
	pack, err := CreatePack(w, PackInput{Name: text(" New "), Description: text(" "), Category: text(" c "), Tags: &tags,
		Lists: []PackListInput{packList(" First ", " 基本 ", "", "  ", "初級"), packList("Second")}}, "pn", []string{"n1", "n2"}, packNow)
	if err != nil {
		t.Fatal(err)
	}
	valid(t, w)
	want := Pack{ID: "pn", Name: "New", Category: "c", Tags: []string{"t"}, CreatedAt: "2026-10-26T00:00:00.000Z"}
	if !reflect.DeepEqual(*pack, want) || pack != &w.Packs[2] {
		t.Fatalf("pack = %+v", *pack)
	}
	wantLists := []List{
		{ID: "n1", Name: "First", Levels: []string{"基本", "初級"}, PackID: "pn", Category: "c", Tags: []string{"t"}, Words: packWordsOf("x"),
			Records: []Record{}, CreatedAt: "2026-10-26T00:00:00.000Z"},
		{ID: "n2", Name: "Second", PackID: "pn", Category: "c", Tags: []string{"t"}, Words: packWordsOf("x"), Records: []Record{},
			CreatedAt: "2026-10-26T00:00:00.000Z"},
	}
	if !reflect.DeepEqual(w.Lists[3:], wantLists) {
		t.Fatalf("lists = %+v", w.Lists[3:])
	}
	none, err := CreatePack(editLibrary(), PackInput{Name: text("N"), Lists: []PackListInput{packList("F", " ", "")}}, "pn",
		[]string{"n1"}, packNow)
	if err != nil || none == nil {
		t.Fatal(err)
	}
}

func TestCreatePackErrors(t *testing.T) {
	one := []PackListInput{packList("N")}
	order := []string{"a"}
	cases := []struct {
		input PackInput
		key   string
	}{
		{PackInput{Name: text(" linux "), Lists: one}, "packNameDuplicate"},
		{PackInput{Name: text(" "), Lists: one}, "packNameRequired"},
		{PackInput{Lists: one}, "packNameRequired"},
		{PackInput{Name: text("N")}, "invalidPack"},
		{PackInput{Name: text("N"), Lists: []PackListInput{}}, "invalidPack"},
		{PackInput{Name: text("N"), Lists: one, ListOrder: &order}, "invalidPack"},
		{PackInput{Name: text(strings.Repeat("x", 201)), Lists: one}, "invalidPack"},
		{PackInput{Name: text("N"), Lists: []PackListInput{packList(" ")}}, "listNameRequired"},
		{PackInput{Name: text("N"), Lists: []PackListInput{{Words: packWordsOf("x")}}}, "listNameRequired"},
		{PackInput{Name: text("N"), Lists: []PackListInput{{Name: text("L")}}}, "wordsRequired"},
		{PackInput{Name: text("N"), Lists: []PackListInput{packList("A"), packList(" a ")}}, "listNameDuplicate"},
		{PackInput{Name: text("N"), Lists: []PackListInput{packList("A", "基本"), packList("B", "基本", "1")}}, "levelsConflict"},
	}
	for _, c := range cases {
		w := editLibrary()
		ids := make([]string, len(c.input.Lists))
		for n := range ids {
			ids[n] = fmt.Sprintf("n%d", n)
		}
		_, err := CreatePack(w, c.input, "pn", ids, packNow)
		wantKey(t, err, c.key)
		unchanged(t, w, editLibrary())
	}
	_, err := CreatePack(fullLibrary(0), PackInput{Name: text("N"), Lists: one}, "pn", []string{"n1"}, packNow)
	wantKey(t, err, "listLimit")
}

func TestUpdatePack(t *testing.T) {
	w := editLibrary()
	tags := []string{"x"}
	pack, err := UpdatePack(w, "p", PackInput{Name: text("Linux2"), Description: text("d"), Category: text(""), Tags: &tags})
	if err != nil {
		t.Fatal(err)
	}
	want := Pack{ID: "p", Name: "Linux2", Description: "d", Tags: []string{"x"}, Origin: &Origin{CatalogID: "p", Version: 1}, CreatedAt: packStamp}
	if !reflect.DeepEqual(*pack, want) || pack != &w.Packs[0] {
		t.Fatalf("pack = %+v", *pack)
	}
	// The lists show the pack's new labels.
	if w.Lists[0].Category != "" || !slices.Equal(w.Lists[2].Tags, []string{"x"}) {
		t.Fatalf("lists = %+v", w.Lists)
	}
	if pack, err := UpdatePack(w, "p", PackInput{Description: text(" ")}); err != nil || pack.Description != "" || pack.Name != "Linux2" {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
	// A field left out stays.
	if pack, err := UpdatePack(w, "p", PackInput{Category: text(" k ")}); err != nil || pack.Category != "k" || !slices.Equal(pack.Tags, tags) {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
	if pack, err := UpdatePack(editLibrary(), "p", PackInput{Name: text("LINUX")}); err != nil || pack.Name != "LINUX" {
		t.Fatalf("pack = %+v, %v", pack, err)
	}
	many := make([]string, MaxTags+1)
	for n := range many {
		many[n] = fmt.Sprint(n)
	}
	cases := []struct {
		id    string
		input PackInput
		key   string
	}{
		{"p", PackInput{Name: text(" go ")}, "packNameDuplicate"},
		{"p", PackInput{Name: text("")}, "packNameRequired"},
		{"p", PackInput{Description: text(strings.Repeat("d", 501))}, "invalidPack"},
		{"p", PackInput{Tags: &many}, "invalidPack"},
		{"p", PackInput{Lists: []PackListInput{packList("x")}}, "invalidPack"},
		{"zz", PackInput{Name: text("N")}, "packNotFound"},
	}
	for _, c := range cases {
		w := editLibrary()
		_, err := UpdatePack(w, c.id, c.input)
		wantKey(t, err, c.key)
		unchanged(t, w, editLibrary())
	}
}

func TestUpdatePackListOrder(t *testing.T) {
	more := func() *Workspace {
		w := editLibrary()
		w.Lists = append(w.Lists, List{ID: "c", Name: "発展", PackID: "p", Words: packWordsOf("x"), Records: []Record{}, CreatedAt: packStamp})
		viewLists(w)
		return w
	}
	cases := []struct {
		order []string
		want  []string
	}{
		{[]string{"b", "a", "c"}, []string{"b", "g", "a", "c"}},
		// Ids the pack does not hold are dropped, and repeated ids kept once.
		{[]string{"x", "b", "g", "c", "a"}, []string{"b", "g", "c", "a"}},
		{[]string{"b", "b", "a", "c"}, []string{"b", "g", "a", "c"}},
		// Lists of the pack not given come after the given ones, in saved order.
		{[]string{"b"}, []string{"b", "g", "a", "c"}},
		{[]string{"c", "x"}, []string{"c", "g", "a", "b"}},
		{[]string{}, []string{"a", "g", "b", "c"}},
	}
	for _, c := range cases {
		w := more()
		order := c.order
		if _, err := UpdatePack(w, "p", PackInput{ListOrder: &order}); err != nil {
			t.Fatal(err)
		}
		if !slices.Equal(listIDs(w), c.want) {
			t.Errorf("%v: lists = %v, want %v", c.order, listIDs(w), c.want)
		}
	}
}

func TestDeletePack(t *testing.T) {
	w := editLibrary()
	if err := DeletePack(w, "p"); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(packIDs(w), []string{"q"}) || !slices.Equal(listIDs(w), []string{"g"}) {
		t.Fatalf("packs = %v, lists = %v", packIDs(w), listIDs(w))
	}
	wantKey(t, DeletePack(w, "zz"), "packNotFound")
}

func TestCreateListInAPack(t *testing.T) {
	w := editLibrary()
	levels := []string{" 中級 ", "", "1"}
	list, err := CreateList(w, ListInput{Name: text(" Go "), PackID: text("p"), Levels: &levels, Words: packWordsOf("x")}, "n", now)
	if err != nil {
		t.Fatal(err)
	}
	// The name only has to differ within the pack, and the list shows the pack's labels.
	want := List{ID: "n", Name: "Go", PackID: "p", Levels: []string{"中級", "1"}, Category: "C", Tags: []string{"t"}, Words: packWordsOf("x"),
		Records: []Record{}, CreatedAt: "2026-10-20T00:00:00.000Z"}
	if !reflect.DeepEqual(*list, want) || list != &w.Lists[3] {
		t.Fatalf("list = %+v", *list)
	}
	valid(t, w)
	category := "c"
	tags := []string{}
	conflict := []string{"基本", "初級"}
	many := []string{"1", "2", "3", "4", "5", "6"}
	cases := []struct {
		input ListInput
		key   string
	}{
		{ListInput{Name: text("N"), PackID: text("p"), Category: &category, Words: packWordsOf("x")}, "invalidList"},
		{ListInput{Name: text("N"), PackID: text("p"), Tags: &tags, Words: packWordsOf("x")}, "invalidList"},
		{ListInput{Name: text("N"), PackID: text("zz"), Words: packWordsOf("x")}, "packNotFound"},
		{ListInput{Name: text(" 応用 "), PackID: text("p"), Words: packWordsOf("x")}, "listNameDuplicate"},
		{ListInput{Name: text("N"), PackID: text("p"), Levels: &conflict, Words: packWordsOf("x")}, "levelsConflict"},
		{ListInput{Name: text("基本"), PackID: text("q"), Levels: &conflict, Words: packWordsOf("x")}, ""},
		{ListInput{Name: text("基本"), PackID: text("p"), Words: packWordsOf("x")}, "listNameDuplicate"},
		{ListInput{Name: text("応用2"), PackID: text("p"), Levels: &many, Words: packWordsOf("x")}, "invalidList"},
		{ListInput{Name: text("N"), Levels: &many, Words: packWordsOf("x")}, "invalidList"},
	}
	for _, c := range cases {
		w := editLibrary()
		_, err := CreateList(w, c.input, "n", now)
		if c.key == "" {
			if err != nil {
				t.Fatal(err)
			}
			continue
		}
		wantKey(t, err, c.key)
		unchanged(t, w, editLibrary())
	}
	// A list without levels is chosen by its name, which must not be another list's first level.
	_, err = CreateList(editLibrary(), ListInput{Name: text("基本2"), PackID: text("p"), Levels: &[]string{"応用", "上級"}, Words: packWordsOf("x")}, "n", now)
	wantKey(t, err, "levelsConflict")
	// Without a pack the list starts one of its own, with its levels tidied.
	w = editLibrary()
	list, err = CreateList(w, ListInput{Name: text("Rust"), Levels: &[]string{" 基本 ", " "}, Words: packWordsOf("x")}, "n", now)
	if err != nil || list.PackID != "" || !slices.Equal(list.Levels, []string{"基本"}) {
		t.Fatalf("list = %+v, %v", list, err)
	}
	list, err = CreateList(w, ListInput{Name: text("Rust2"), Levels: &[]string{" "}, Words: packWordsOf("x")}, "n2", now)
	if err != nil || list.Levels != nil {
		t.Fatalf("list = %+v, %v", list, err)
	}
	_, err = CreateList(fullLibrary(0), ListInput{Name: text("N"), PackID: text("p0"), Words: packWordsOf("x")}, "n", now)
	wantKey(t, err, "listLimit")
}

func TestUpdateListMovesToAPack(t *testing.T) {
	w := editLibrary()
	w.Lists[1].Levels = []string{"Go"}
	list, err := UpdateList(w, "g", ListInput{PackID: text("p")})
	if err != nil {
		t.Fatal(err)
	}
	// The moved list goes after the last list of the pack it joins and shows that pack's labels.
	if !slices.Equal(listIDs(w), []string{"a", "b", "g"}) || list != &w.Lists[2] || list.PackID != "p" || list.Category != "C" ||
		!slices.Equal(list.Tags, []string{"t"}) || !slices.Equal(list.Levels, []string{"Go"}) || len(list.Words) != 1 {
		t.Fatalf("lists = %+v", w.Lists)
	}
	lib := &Workspace{Packs: editLibrary().Packs, Lists: []List{
		{ID: "a", Name: "A", PackID: "p", Words: packWordsOf("x"), Records: []Record{}},
		{ID: "g", Name: "G", PackID: "q", Words: packWordsOf("x"), Records: []Record{}},
		{ID: "b", Name: "B", PackID: "p", Words: packWordsOf("x"), Records: []Record{}},
		{ID: "h", Name: "H", PackID: "q", Words: packWordsOf("x"), Records: []Record{}},
	}}
	if _, err := UpdateList(lib, "a", ListInput{PackID: text("q")}); err != nil || !slices.Equal(listIDs(lib), []string{"g", "b", "h", "a"}) {
		t.Fatalf("lists = %v, %v", listIDs(lib), err)
	}
	// Staying in the pack keeps the place.
	if _, err := UpdateList(lib, "g", ListInput{PackID: text("q"), Name: text("G2")}); err != nil ||
		!slices.Equal(listIDs(lib), []string{"g", "b", "h", "a"}) {
		t.Fatalf("lists = %v, %v", listIDs(lib), err)
	}
	conflict := []string{"基本"}
	cases := []struct {
		id    string
		input ListInput
		key   string
	}{
		{"a", ListInput{PackID: text("zz")}, "packNotFound"},
		{"g", ListInput{PackID: text("p"), Name: text("基本")}, "listNameDuplicate"},
		{"g", ListInput{PackID: text("p"), Levels: &conflict}, "levelsConflict"},
		{"b", ListInput{Levels: &conflict}, "levelsConflict"},
		{"b", ListInput{Levels: &[]string{" "}, Name: text("基本2")}, ""},
		{"missing", ListInput{PackID: text("p")}, "listNotFound"},
	}
	for _, c := range cases {
		w := editLibrary()
		_, err := UpdateList(w, c.id, c.input)
		if c.key == "" {
			if err != nil {
				t.Fatal(err)
			}
			continue
		}
		wantKey(t, err, c.key)
		unchanged(t, w, editLibrary())
	}
	// Editing a list is not checked against itself, and a rename is checked only within the list's pack.
	w = editLibrary()
	if list, err := UpdateList(w, "a", ListInput{Levels: &[]string{"基本"}, Name: text("Go")}); err != nil || list.Name != "Go" {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if list, err := UpdateList(w, "b", ListInput{Levels: &[]string{}}); err != nil || list.Levels != nil {
		t.Fatalf("list = %+v, %v", list, err)
	}
}

func TestInitialPacksHaveOrigin(t *testing.T) {
	w, err := Initial()
	if err != nil {
		t.Fatal(err)
	}
	for _, pack := range w.Packs {
		if pack.Origin == nil || pack.Origin.CatalogID != pack.ID || pack.Origin.Version != 1 {
			t.Fatalf("pack %s: origin = %+v", pack.ID, pack.Origin)
		}
	}
}

// Store.Modify runs ApplyListChange after every change; it keeps what the pack functions did.
func TestApplyListChangeKeepsPackChanges(t *testing.T) {
	apply := func(change func(w *Workspace) error) *Workspace {
		t.Helper()
		w := editLibrary()
		previous := &Workspace{Lists: slices.Clone(w.Lists), Packs: slices.Clone(w.Packs)}
		if err := change(w); err != nil {
			t.Fatal(err)
		}
		w.ApplyListChange(previous)
		valid(t, w)
		return w
	}
	created := apply(func(w *Workspace) error {
		tags := []string{"n"}
		_, err := CreatePack(w, PackInput{Name: text("New"), Category: text("c"), Tags: &tags, Lists: []PackListInput{packList("Go")}}, "pn",
			[]string{"n1"}, packNow)
		return err
	})
	if !slices.Equal(packIDs(created), []string{"p", "q", "pn"}) || created.Packs[2].Category != "c" || created.Lists[3].PackID != "pn" {
		t.Fatalf("packs = %+v, lists = %+v", created.Packs, created.Lists)
	}
	copied := apply(func(w *Workspace) error {
		_, err := CopyPack(w, "p", nil, "c", []string{"c1", "c2"}, packNow)
		return err
	})
	if !slices.Equal(packIDs(copied), []string{"p", "c", "q"}) || copied.Packs[1].Category != "C" {
		t.Fatalf("packs = %+v", copied.Packs)
	}
	// A pack of one list renamed to its list's name in another case keeps the new name.
	renamed := apply(func(w *Workspace) error {
		tags := []string{}
		_, err := UpdatePack(w, "q", PackInput{Name: text("GO"), Category: text("k"), Tags: &tags})
		return err
	})
	if renamed.Packs[1].Name != "GO" || renamed.Packs[1].Category != "k" || renamed.Lists[1].Category != "k" {
		t.Fatalf("packs = %+v", renamed.Packs)
	}
	relabelled := apply(func(w *Workspace) error {
		_, err := UpdatePack(w, "p", PackInput{Category: text("")})
		return err
	})
	if relabelled.Packs[0].Category != "" || !slices.Equal(relabelled.Packs[0].Tags, []string{"t"}) {
		t.Fatalf("packs = %+v", relabelled.Packs)
	}
	deleted := apply(func(w *Workspace) error { return DeletePack(w, "p") })
	if !slices.Equal(packIDs(deleted), []string{"q"}) || !slices.Equal(listIDs(deleted), []string{"g"}) {
		t.Fatalf("packs = %v, lists = %v", packIDs(deleted), listIDs(deleted))
	}
	// A list moved in keeps the labels of the pack it joins, and the pack it left empty goes.
	moved := apply(func(w *Workspace) error { _, err := UpdateList(w, "g", ListInput{PackID: text("p")}); return err })
	if !slices.Equal(packIDs(moved), []string{"p"}) || moved.Packs[0].Category != "C" || moved.Lists[2].Category != "C" {
		t.Fatalf("packs = %+v, lists = %+v", moved.Packs, moved.Lists)
	}
	joined := apply(func(w *Workspace) error {
		_, err := CreateList(w, ListInput{Name: text("New"), PackID: text("q"), Words: packWordsOf("x")}, "n", now)
		return err
	})
	if !slices.Equal(packIDs(joined), []string{"p", "q"}) || joined.Lists[3].PackID != "q" || joined.Packs[1].Category != "" {
		t.Fatalf("packs = %+v, lists = %+v", joined.Packs, joined.Lists)
	}
}

// ApplyListChange renames a pack of one list after its list, so a rename that would make it take another pack's name is
// refused; a list in a pack of several only has to differ from the lists of its pack.
func TestUpdateListRenameDoesNotTakeAnotherPacksName(t *testing.T) {
	library := func() *Workspace {
		w := &Workspace{Packs: []Pack{{ID: "pa", Name: "A"}, {ID: "pb", Name: "B"}, {ID: "pc", Name: "C"}}, Lists: []List{
			{ID: "a", Name: "A", PackID: "pa", Words: packWordsOf("x"), Records: []Record{}},
			{ID: "b", Name: "B", PackID: "pb", Words: packWordsOf("x"), Records: []Record{}},
			{ID: "c1", Name: "C1", PackID: "pc", Words: packWordsOf("x"), Records: []Record{}},
			{ID: "c2", Name: "C2", PackID: "pc", Words: packWordsOf("x"), Records: []Record{}},
		}}
		viewLists(w)
		return w
	}
	w := library()
	_, err := UpdateList(w, "a", ListInput{Name: text(" b ")})
	wantKey(t, err, "listNameDuplicate")
	unchanged(t, w, library())
	// Allowed: a list in a pack of several, a pack not named after its list, and the list's own pack name.
	for _, c := range []struct{ id, name string }{{"c1", "B"}, {"a", "a"}} {
		w := library()
		previous := &Workspace{Lists: slices.Clone(w.Lists), Packs: slices.Clone(w.Packs)}
		if _, err := UpdateList(w, c.id, ListInput{Name: text(c.name)}); err != nil {
			t.Fatalf("%s → %s: %v", c.id, c.name, err)
		}
		w.ApplyListChange(previous)
		valid(t, w)
		var names []string
		for _, pack := range w.Packs {
			names = append(names, pack.Name)
		}
		if !slices.Contains(names, "B") || slices.Contains(names, "B（2）") {
			t.Fatalf("packs = %v", names)
		}
	}
	w = library()
	w.Packs[0].Name = "Own"
	if _, err := UpdateList(w, "a", ListInput{Name: text("B")}); err != nil {
		t.Fatal(err)
	}
}

func TestDecodePackFileDropsAByteOrderMark(t *testing.T) {
	text := packFileText(`[{"name":"L","words":[{"display":"a","input":"a","annotation":""}]}]`, `{"name":"P"}`)
	if file, err := DecodePackFile([]byte("\uFEFF" + text)); err != nil || file.Pack.Name != "P" {
		t.Fatalf("file = %+v, %v", file, err)
	}
	_, err := DecodePackFile([]byte("\uFEFF\uFEFF" + text))
	wantKey(t, err, "packFileUnreadable")
}

func TestUpdateListMovedTagsAreTheirOwn(t *testing.T) {
	w := editLibrary()
	list, err := UpdateList(w, "g", ListInput{PackID: text("p")})
	if err != nil {
		t.Fatal(err)
	}
	list.Tags[0] = "changed"
	if w.Packs[0].Tags[0] != "t" {
		t.Fatalf("pack tags = %v", w.Packs[0].Tags)
	}
}
