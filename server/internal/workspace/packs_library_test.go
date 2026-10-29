package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// sameJSON fails unless got and want are the same JSON value, whatever the order of their keys.
func sameJSON(t *testing.T, name string, got, want []byte) {
	t.Helper()
	var g, w any
	if err := json.Unmarshal(got, &g); err != nil {
		t.Fatalf("%s: %v in %s", name, err, got)
	}
	if err := json.Unmarshal(want, &w); err != nil {
		t.Fatalf("%s: %v in %s", name, err, want)
	}
	if !reflect.DeepEqual(g, w) {
		t.Fatalf("%s = %s\nwant %s", name, got, want)
	}
}

// stored reads encoded lists as they are saved, without packs applied to them.
func stored(t *testing.T, encoded []byte) []List {
	t.Helper()
	var raw []*rawList
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatal(err)
	}
	lists, err := decodeLists(raw)
	if err != nil {
		t.Fatal(err)
	}
	return lists
}

func encodeBoth(t *testing.T, w *Workspace) ([]byte, []byte) {
	t.Helper()
	lists, err := Encode(w.Lists)
	if err != nil {
		t.Fatal(err)
	}
	packs, err := EncodePacks(w.Packs)
	if err != nil {
		t.Fatal(err)
	}
	return lists, packs
}

// normalizedOnly is Decode without following the catalog: the app's normalizeLibrary alone, as the tests that share
// fixtures with this package read them (the fixtures of tests/fixtures/follow are read with followOfficial).
func normalizedOnly(t *testing.T, lists, devices, packs []byte) *Workspace {
	t.Helper()
	w, err := normalized(lists, devices, packs)
	if err != nil {
		t.Fatal(err)
	}
	viewLists(w)
	return w
}

// The fixtures are shared with tests/wordPacks.test.cjs, so Go reads saved data into the same packs as the app.
func TestPackFixtures(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "tests", "fixtures", "packs", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatalf("fixtures: %v, %v", files, err)
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var fixture struct {
				Lists, Packs json.RawMessage
				Expected     struct{ Lists, Packs json.RawMessage }
			}
			if err := json.Unmarshal(data, &fixture); err != nil {
				t.Fatal(err)
			}
			var packs []byte
			if string(fixture.Packs) != "null" {
				packs = fixture.Packs
			}
			w := normalizedOnly(t, fixture.Lists, []byte("[]"), packs)
			lists, encodedPacks := encodeBoth(t, w)
			sameJSON(t, "lists", lists, fixture.Expected.Lists)
			sameJSON(t, "packs", encodedPacks, fixture.Expected.Packs)
			if err := CheckPacks(w.Packs, stored(t, lists)); err != nil {
				t.Fatalf("CheckPacks: %v", err)
			}
			// Reading the result again changes nothing.
			againLists, againPacks := encodeBoth(t, normalizedOnly(t, lists, []byte("[]"), encodedPacks))
			sameJSON(t, "lists again", againLists, lists)
			sameJSON(t, "packs again", againPacks, encodedPacks)
		})
	}
}

func TestDecodeRefusesBadPacks(t *testing.T) {
	pack := `{"id":"p","name":"P","createdAt":"2026-10-01T00:00:00.000Z","future":1}`
	list := `[{"id":"a","name":"a","packId":"p","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`
	if _, err := Decode([]byte(list), []byte("[]"), []byte("["+pack+"]")); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{`null`, `{}`, `[{"id":1,"name":"P","createdAt":"x"}]`, `[{"id":"","name":"P","createdAt":"x"}]`,
		`[{"id":"p","createdAt":"x"}]`, `[{"id":"p","name":"P"}]`, `[{"id":"p","name":"P","createdAt":"x","tags":"x"}]`,
		`[{"id":"p","name":"P","createdAt":"x","origin":{"catalogId":"c"}}]`, "[" + pack + "," + pack + "]"} {
		if _, err := Decode([]byte(list), []byte("[]"), []byte(bad)); err == nil {
			t.Errorf("%s was read", bad)
		}
	}
	for _, bad := range []string{`"packId":1`, `"group":1`} {
		if _, err := Decode([]byte(`[{"id":"a","name":"a",`+bad+`,"createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`),
			[]byte("[]"), nil); err == nil {
			t.Errorf("%s was read", bad)
		}
	}
}

func TestPackExtraKept(t *testing.T) {
	w, err := Decode([]byte(`[{"id":"a","name":"a","packId":"p","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`),
		[]byte("[]"), []byte(`[{"id":"p","name":"P","createdAt":"2026-10-01T00:00:00.000Z","future":1}]`))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := EncodePacks(w.Packs)
	if err != nil || !strings.Contains(string(encoded), `"future":1`) {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
}

// The library of the applyListChange tests in tests/wordPacks.test.cjs.
const (
	packWords   = `"words":[{"display":"ls","input":"ls","annotation":""}],"records":[],"createdAt":"2026-10-01T00:00:00.000Z"`
	packLists   = `[{"id":"a","name":"a","packId":"p","levels":["基本"],` + packWords + `},{"id":"b","name":"b","packId":"p",` + packWords + `},{"id":"s","name":"Solo","packId":"q",` + packWords + `}]`
	packLibrary = `[{"id":"p","name":"Linux","category":"プログラミング","tags":["Linux"],"createdAt":"2026-10-01T00:00:00.000Z"},{"id":"q","name":"Solo","createdAt":"2026-10-01T00:00:00.000Z"}]`
)

func library(t *testing.T) *Workspace {
	t.Helper()
	w, err := Decode([]byte(packLists), []byte("[]"), []byte(packLibrary))
	if err != nil {
		t.Fatal(err)
	}
	return w
}

// After Decode, each list carries its pack's category and tags, as the app's viewLists gives them to its screens.
func TestDecodeViewsPackLabels(t *testing.T) {
	w := library(t)
	a, s := w.Lists[0], w.Lists[2]
	if a.Category != "プログラミング" || !reflect.DeepEqual(a.Tags, []string{"Linux"}) || a.PackID != "p" || a.Group != "" {
		t.Fatalf("a = %+v", a)
	}
	if s.Category != "" || s.Tags != nil || s.Group != "" {
		t.Fatalf("s = %+v", s)
	}
	// The lists share no tags with their pack or each other.
	w.Lists[0].Tags[0] = "changed"
	if w.Packs[0].Tags[0] != "Linux" || w.Lists[1].Tags[0] != "Linux" {
		t.Fatalf("packs = %+v, lists = %+v", w.Packs, w.Lists)
	}
	// levels is read as the list's own.
	if !slices.Equal(a.Levels, []string{"基本"}) || a.Extra != "" {
		t.Fatalf("levels = %v, extra = %s", a.Levels, a.Extra)
	}
}

func TestApplyListChange(t *testing.T) {
	previous := library(t)
	change := func(edit func(w *Workspace)) *Workspace {
		w := library(t)
		edit(w)
		w.ApplyListChange(previous)
		return w
	}
	edit := func(id string, f func(*List)) func(*Workspace) {
		return func(w *Workspace) { f(w.Find(id)) }
	}

	// A label change goes to the pack, and from there to every list in it.
	next := change(edit("b", func(l *List) { l.Tags = []string{"Linux", "zsh"} }))
	if !reflect.DeepEqual(next.Packs[0].Tags, []string{"Linux", "zsh"}) || !reflect.DeepEqual(next.Lists[0].Tags, []string{"Linux", "zsh"}) {
		t.Fatalf("packs = %+v, lists = %+v", next.Packs, next.Lists)
	}
	encoded, _ := encodeBoth(t, next)
	for _, field := range []string{`"tags"`, `"group"`, `"category"`} {
		if strings.Contains(string(encoded), field) {
			t.Fatalf("lists = %s", encoded)
		}
	}

	// A new list without a packId gets a pack of its own.
	next = change(func(w *Workspace) {
		w.Lists = append(w.Lists, List{ID: "n", Name: "New", Category: "X", Words: []Word{{Display: "ls", Input: "ls"}}, Records: []Record{},
			CreatedAt: "2026-10-01T00:00:00.000Z"})
	})
	if got := next.Packs[len(next.Packs)-1]; !reflect.DeepEqual(got, Pack{ID: "pack-n", Name: "New", Category: "X", CreatedAt: "2026-10-01T00:00:00.000Z"}) {
		t.Fatalf("pack = %+v", got)
	}
	if n := next.Find("n"); n.PackID != "pack-n" || n.Category != "X" {
		t.Fatalf("n = %+v", n)
	}

	// A pack of one list follows the list's rename; a pack of more does not.
	next = change(edit("s", func(l *List) { l.Name = "Renamed" }))
	if next.Packs[1].Name != "Renamed" {
		t.Fatalf("packs = %+v", next.Packs)
	}
	next = change(edit("a", func(l *List) { l.Name = "a2" }))
	if next.Packs[0].Name != "Linux" {
		t.Fatalf("packs = %+v", next.Packs)
	}

	// Removing the last list of a pack removes the pack.
	next = change(func(w *Workspace) { w.Lists = slices.DeleteFunc(w.Lists, func(l List) bool { return l.ID == "s" }) })
	if len(next.Packs) != 1 || next.Packs[0].ID != "p" {
		t.Fatalf("packs = %+v", next.Packs)
	}
	lists, _ := encodeBoth(t, next)
	if err := CheckPacks(next.Packs, stored(t, lists)); err != nil {
		t.Fatal(err)
	}
}

func TestApplyListChangeLeavesUnchangedViewAndClearsDroppedLabels(t *testing.T) {
	previous := library(t)
	next := library(t)
	next.ApplyListChange(previous)
	lists, packs := encodeBoth(t, next)
	sameJSON(t, "lists", lists, []byte(packLists))
	sameJSON(t, "packs", packs, []byte(packLibrary))

	// With one list left in the pack, clearing its labels clears the pack's.
	next = library(t)
	next.Lists = slices.DeleteFunc(next.Lists, func(l List) bool { return l.ID == "b" })
	next.Lists[0].Category, next.Lists[0].Tags = " ", []string{}
	next.ApplyListChange(previous)
	if next.Packs[0].Category != "" || next.Packs[0].Tags != nil {
		t.Fatalf("pack = %+v", next.Packs[0])
	}
}

func TestApplyListChangeClearsPackLabelsFromOneList(t *testing.T) {
	previous := library(t)
	next := library(t)
	next.Lists[1].Category, next.Lists[1].Tags = "", nil
	next.ApplyListChange(previous)
	if next.Packs[0].Category != "" || next.Packs[0].Tags != nil || next.Lists[0].Category != "" || next.Lists[0].Tags != nil {
		t.Fatalf("packs = %+v, lists = %+v", next.Packs, next.Lists)
	}
	lists, _ := encodeBoth(t, next)
	if err := CheckPacks(next.Packs, stored(t, lists)); err != nil {
		t.Fatal(err)
	}
}

// The cases of validateLibrary in tests/wordPacks.test.cjs.
func TestCheckPacks(t *testing.T) {
	list := List{ID: "a", Name: "a", PackID: "p", Words: []Word{{Display: "ls", Input: "ls"}}, Records: []Record{}, CreatedAt: "2026-10-01T00:00:00.000Z"}
	pack := Pack{ID: "p", Name: "P", CreatedAt: "2026-10-01T00:00:00.000Z"}
	with := func(l List, f func(*List)) List { f(&l); return l }
	withPack := func(p Pack, f func(*Pack)) Pack { f(&p); return p }
	if err := CheckPacks([]Pack{pack}, []List{list}); err != nil {
		t.Fatal(err)
	}
	q := withPack(pack, func(p *Pack) { p.ID, p.Name = "q", "Q" })
	many := func(n int) ([]Pack, []List) {
		var packs []Pack
		var lists []List
		for i := range n {
			packs = append(packs, withPack(pack, func(p *Pack) { p.ID, p.Name = fmt.Sprintf("p%d", i), fmt.Sprintf("P%d", i) }))
			lists = append(lists, with(list, func(l *List) {
				l.ID, l.Name, l.PackID = fmt.Sprintf("l%d", i), fmt.Sprintf("l%d", i), fmt.Sprintf("p%d", i)
			}))
		}
		return packs, lists
	}
	manyPacks, manyLists := many(MaxLists + 1)
	tags := make([]string, 21)
	for i := range tags {
		tags[i] = fmt.Sprintf("t%d", i)
	}
	cases := map[string]struct {
		packs []Pack
		lists []List
	}{
		"a list in a pack that does not exist": {[]Pack{pack, q}, []List{with(list, func(l *List) { l.PackID = "r" }),
			with(list, func(l *List) { l.ID, l.Name, l.PackID = "b", "b", "q" }), with(list, func(l *List) { l.ID, l.Name = "c", "c" })}},
		"a list without a packId": {[]Pack{pack}, []List{list, with(list, func(l *List) { l.ID, l.Name, l.PackID = "b", "b", "" })}},
		"a pack without lists":    {[]Pack{pack, q}, []List{list}},
		"two packs with one name": {[]Pack{pack, withPack(pack, func(p *Pack) { p.ID, p.Name = "q", " p " })},
			[]List{list, with(list, func(l *List) { l.ID, l.Name, l.PackID = "b", "b", "q" })}},
		"two packs with one id":          {[]Pack{pack, withPack(pack, func(p *Pack) { p.Name = "Q" })}, []List{list}},
		"a blank pack name":              {[]Pack{withPack(pack, func(p *Pack) { p.Name = " " })}, []List{list}},
		"a pack name over the limit":     {[]Pack{withPack(pack, func(p *Pack) { p.Name = strings.Repeat("n", 201) })}, []List{list}},
		"a description over the limit":   {[]Pack{withPack(pack, func(p *Pack) { p.Description = strings.Repeat("d", 501) })}, []List{list}},
		"a category over the limit":      {[]Pack{withPack(pack, func(p *Pack) { p.Category = strings.Repeat("c", 51) })}, []List{list}},
		"a tag over the limit":           {[]Pack{withPack(pack, func(p *Pack) { p.Tags = []string{strings.Repeat("t", 51)} })}, []List{list}},
		"more tags than the limit":       {[]Pack{withPack(pack, func(p *Pack) { p.Tags = tags })}, []List{list}},
		"a list name repeated in a pack": {[]Pack{pack}, []List{list, with(list, func(l *List) { l.ID, l.Name = "b", "A" })}},
		"a list with a group":            {[]Pack{pack}, []List{with(list, func(l *List) { l.Group = "g" })}},
		"a list with a category":         {[]Pack{pack}, []List{with(list, func(l *List) { l.Category = "c" })}},
		"a list with tags":               {[]Pack{pack}, []List{with(list, func(l *List) { l.Tags = []string{"t"} })}},
	}
	for reason, c := range cases {
		var e *Error
		if err := CheckPacks(c.packs, c.lists); !errors.As(err, &e) || e.Key != "invalidWorkspace" {
			t.Errorf("%s: err = %v", reason, err)
		}
	}
	// Packs have no limit of their own: every pack has a list, so the list limit bounds them.
	if err := CheckPacks(manyPacks, manyLists); err != nil {
		t.Fatal(err)
	}
}

// The cases of levelsConflict in tests/wordPacks.test.cjs: lists of a pack whose paths overlap are refused, but paths
// are compared as they are, and only within a pack.
func TestCheckPacksLevels(t *testing.T) {
	list := List{ID: "a", Name: "a", PackID: "p", Words: []Word{{Display: "ls", Input: "ls"}}, Records: []Record{}, CreatedAt: "2026-10-01T00:00:00.000Z"}
	packs := []Pack{{ID: "p", Name: "P", CreatedAt: list.CreatedAt}, {ID: "q", Name: "Q", CreatedAt: list.CreatedAt}}
	with := func(id string, f func(*List)) List {
		l := list
		l.ID, l.Name = id, id
		f(&l)
		return l
	}
	inQ := with("z", func(l *List) { l.PackID = "q" })
	cases := map[string][]List{
		"equal levels":            {with("a", func(l *List) { l.Levels = []string{"初級"} }), with("b", func(l *List) { l.Levels = []string{"初級"} })},
		"a name equal to a level": {with("a", func(l *List) { l.Name = "初級" }), with("b", func(l *List) { l.Levels = []string{"初級"} })},
	}
	for reason, lists := range cases {
		var e *Error
		if err := CheckPacks(packs, append(lists, inQ)); !errors.As(err, &e) || e.Key != "levelsConflict" {
			t.Errorf("%s: err = %v", reason, err)
		}
	}
	if err := CheckPacks(packs, []List{with("a", func(l *List) { l.Levels = []string{"初級"} }), with("b", func(l *List) { l.Levels = []string{"初級 "} }),
		with("c", func(l *List) { l.Levels = []string{"中級"} }),
		with("e", func(l *List) { l.PackID, l.Levels = "q", []string{"初級"} })}); err != nil {
		t.Fatal(err)
	}
	// A list with several levels, sent by an app before v0.97.0, is taken, and not checked for overlaps: it is stored
	// joined into one level and told apart.
	several := []List{with("a", func(l *List) { l.Levels = []string{"基本", "初級"} }), with("b", func(l *List) { l.Levels = []string{"基本"} }),
		with("c", func(l *List) { l.Levels = []string{"基本", "初級"} }), inQ}
	if err := CheckPacks(packs, several); err != nil {
		t.Fatal(err)
	}
	// CheckLibrary keeps the key, so a save is refused with it.
	sent := `[{"id":"a","name":"a","packId":"p","levels":["初級"],"createdAt":"2026-10-01","words":[{"display":"ls","input":"ls","annotation":""}],"records":[]},` +
		`{"id":"b","name":"b","packId":"p","levels":["初級"],"createdAt":"2026-10-01","words":[{"display":"ls","input":"ls","annotation":""}],"records":[]}]`
	var e *Error
	if err := CheckLibrary([]byte(sent), []byte(`[{"id":"p","name":"P","createdAt":"2026-10-01"}]`)); !errors.As(err, &e) || e.Key != "levelsConflict" {
		t.Fatalf("err = %v", err)
	}
}

// A level or name with （n） stays within its limit, counted in UTF-16 code units.
func TestSeparateLevelsLimit(t *testing.T) {
	var lists []List
	for i := range 12 {
		lists = append(lists, List{ID: fmt.Sprintf("l%d", i), Name: fmt.Sprintf("l%d", i), PackID: "p", Levels: []string{strings.Repeat("a", MaxLevel)}})
	}
	lists = append(lists, List{ID: "m", Name: strings.Repeat("😀", 25), PackID: "q"}, List{ID: "n", Name: "n", PackID: "q", Levels: []string{strings.Repeat("😀", 25)}})
	separated := separateLevels(lists)
	if got := separated[11].Levels[0]; got != strings.Repeat("a", 46)+"（12）" {
		t.Fatalf("level = %q", got)
	}
	for _, list := range separated {
		if length(list.Name) > MaxListName || slices.ContainsFunc(list.Levels, func(level string) bool { return length(level) > MaxLevel }) {
			t.Fatalf("%s is over the limit: %q %q", list.ID, list.Name, list.Levels)
		}
	}
	// A character of two code units is not split by the cut.
	if got := separated[13].Levels[0]; got != strings.Repeat("😀", 23)+"（2）" {
		t.Fatalf("level = %q", got)
	}
}

// The cases of several levels in tests/wordPacks.test.cjs: they are joined with ・ into one, trimmed and without empty
// ones and without ・ at their ends, cut to MaxLevel UTF-16 code units without splitting a character of two or leaving a
// ・ at the end; one level stays as it was saved.
func TestCollapseLevels(t *testing.T) {
	cases := []struct{ levels, want []string }{
		{[]string{"基本", "初級"}, []string{"基本・初級"}},
		{[]string{" 基本 ", "", "基本"}, []string{"基本・基本"}},
		{[]string{" ", ""}, nil},
		{[]string{strings.Repeat("a", 50), "b"}, []string{strings.Repeat("a", 50)}},
		{[]string{strings.Repeat("a", 48), " b c "}, []string{strings.Repeat("a", 48) + "・b"}},
		{[]string{strings.Repeat("a", 48), "😀"}, []string{strings.Repeat("a", 48)}},
		{[]string{"・基本・ ", " ・ ", "初級・"}, []string{"基本・初級"}},
		{[]string{"・", " "}, nil},
		{[]string{" 基本 "}, []string{" 基本 "}},
	}
	for _, c := range cases {
		if got := separateLevels([]List{{ID: "a", Name: "a", PackID: "p", Levels: c.levels}})[0].Levels; !slices.Equal(got, c.want) || (c.want == nil) != (got == nil) {
			t.Errorf("%q: levels = %q; want %q", c.levels, got, c.want)
		}
	}
	// A joined level that another list of the pack holds is told apart afterwards.
	got := separateLevels([]List{{ID: "a", Name: "a", PackID: "p", Levels: []string{"基本・初級"}}, {ID: "b", Name: "b", PackID: "p", Levels: []string{"基本", "初級"}}})
	if !slices.Equal(got[1].Levels, []string{"基本・初級（2）"}) {
		t.Errorf("levels = %q", got[1].Levels)
	}
}

// CheckLibrary reads a save as it was sent, so a label left on a list is refused even when it is empty, and a pack's
// optional field may be left out but not null, as validateLibrary and decodePacks do.
func TestCheckLibrary(t *testing.T) {
	const list = `{"id":"a","name":"a","packId":"p","createdAt":"2026-10-01T00:00:00.000Z","words":[{"display":"ls","input":"ls","annotation":""}],"records":[]}`
	const pack = `{"id":"p","name":"P","createdAt":"2026-10-01T00:00:00.000Z"}`
	withList := func(fields string) string { return strings.Replace(list, `"records":[]`, `"records":[],`+fields, 1) }
	withPack := func(fields string) string { return strings.Replace(pack, `"createdAt"`, fields+`,"createdAt"`, 1) }
	if err := CheckLibrary([]byte(`[`+list+`]`), []byte(`[`+withPack(`"description":"d","category":"c","tags":["t"],"origin":{"catalogId":"x","version":1}`)+`]`)); err != nil {
		t.Fatal(err)
	}
	cases := map[string][2]string{
		"an empty category":        {`[` + withList(`"category":""`) + `]`, `[` + pack + `]`},
		"a category":               {`[` + withList(`"category":"c"`) + `]`, `[` + pack + `]`},
		"a null category":          {`[` + withList(`"category":null`) + `]`, `[` + pack + `]`},
		"empty tags":               {`[` + withList(`"tags":[]`) + `]`, `[` + pack + `]`},
		"tags":                     {`[` + withList(`"tags":["t"]`) + `]`, `[` + pack + `]`},
		"an empty group":           {`[` + withList(`"group":""`) + `]`, `[` + pack + `]`},
		"a group":                  {`[` + withList(`"group":"g"`) + `]`, `[` + pack + `]`},
		"a pack that is not there": {`[` + strings.Replace(list, `"p"`, `"missing"`, 1) + `]`, `[` + pack + `]`},
		"a pack without lists":     {`[` + list + `]`, `[` + pack + `,` + strings.Replace(withPack(`"category":"c"`), `"p"`, `"q"`, 1) + `]`},
		"a null description":       {`[` + list + `]`, `[` + withPack(`"description":null`) + `]`},
		"a null pack category":     {`[` + list + `]`, `[` + withPack(`"category":null`) + `]`},
		"null pack tags":           {`[` + list + `]`, `[` + withPack(`"tags":null`) + `]`},
		"a null origin":            {`[` + list + `]`, `[` + withPack(`"origin":null`) + `]`},
		"packs not an array":       {`[` + list + `]`, `{}`},
		"null packs":               {`[` + list + `]`, `null`},
		"a pack without a name":    {`[` + list + `]`, `[{"id":"p","createdAt":"2026-10-01T00:00:00.000Z"}]`},
		"an unreadable list":       {`[{"id":""}]`, `[` + pack + `]`},
		"lists not an array":       {`{}`, `[` + pack + `]`},
	}
	for name, c := range cases {
		var refused *Error
		if err := CheckLibrary([]byte(c[0]), []byte(c[1])); !errors.As(err, &refused) || refused.Key != "invalidWorkspace" {
			t.Errorf("%s: err = %v; want invalidWorkspace", name, err)
		}
	}
}

// DecodeLists refuses what is not lists.
func TestDecodeListsRefuses(t *testing.T) {
	for _, bad := range []string{`{}`, `null`, `[{"id":""}]`} {
		if _, err := DecodeLists([]byte(bad)); err == nil {
			t.Errorf("DecodeLists(%s) succeeded", bad)
		}
	}
}

// Accounts merged from removed profiles may hold more than MaxLists lists; converting them makes a one-list pack of
// each, and CheckPacks lets them be saved.
func TestCheckPacksAcceptsConvertedListsOverTheListLimit(t *testing.T) {
	var lists []List
	for i := range MaxLists + 1 {
		lists = append(lists, List{ID: fmt.Sprintf("l%d", i), Name: fmt.Sprintf("l%d", i),
			Words: []Word{{Display: "ls", Input: "ls"}}, CreatedAt: "2026-10-01T00:00:00.000Z"})
	}
	packs, converted := convertLibrary(lists)
	if len(packs) != MaxLists+1 {
		t.Fatalf("packs = %d", len(packs))
	}
	if err := CheckPacks(packs, converted); err != nil {
		t.Fatal(err)
	}
}
