package workspace

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func text(value string) *string { return &value }

// two lists: l1 英単語 with a record, and l2 Fruits.
func two() *Workspace {
	id := "r1"
	return &Workspace{Lists: []List{
		{ID: "l1", Name: "英単語", Words: []Word{{Display: "apple", Input: "apple", Annotation: "りんご"}},
			Records: []Record{{ID: &id, Time: 1, Date: "2026-10-10T00:00:00.000Z"}}, CreatedAt: "2026-10-01T00:00:00.000Z"},
		{ID: "l2", Name: "Fruits", Words: []Word{{Display: "pear", Input: "pear"}}, Records: []Record{}, CreatedAt: "2026-10-02T00:00:00.000Z"},
	}, Devices: []Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}}
}

func wantKey(t *testing.T, err error, key string) {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Key != key {
		t.Fatalf("err = %v, want %s", err, key)
	}
}

var now = time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)

func TestCreateList(t *testing.T) {
	w := two()
	list, err := CreateList(w, ListInput{Name: text("  動物  "), Words: []Word{{Display: " cat ", Input: "cat "}}}, "new", now)
	if err != nil {
		t.Fatal(err)
	}
	if list != &w.Lists[2] || len(w.Lists) != 3 {
		t.Fatalf("lists = %+v", w.Lists)
	}
	if list.ID != "new" || list.Name != "動物" || list.CreatedAt != "2026-10-20T00:00:00.000Z" || list.Records == nil || len(list.Records) != 0 {
		t.Fatalf("list = %+v", list)
	}
	if list.Words[0] != (Word{Display: " cat ", Input: "cat ", Annotation: ""}) {
		t.Fatalf("words = %+v", list.Words)
	}
}

func TestCreateListErrors(t *testing.T) {
	word := []Word{{Display: "a", Input: "a"}}
	many := make([]Word, MaxWords+1)
	for i := range many {
		many[i] = Word{Display: "a", Input: "a"}
	}
	cases := []struct {
		name  string
		input ListInput
		key   string
	}{
		{"no name", ListInput{Words: word}, "listNameRequired"},
		{"blank name", ListInput{Name: text("  "), Words: word}, "listNameRequired"},
		{"duplicate", ListInput{Name: text(" fruits "), Words: word}, "listNameDuplicate"},
		{"no words", ListInput{Name: text("a")}, "wordsRequired"},
		{"empty words", ListInput{Name: text("a"), Words: []Word{}}, "wordsRequired"},
		{"blank display", ListInput{Name: text("a"), Words: []Word{{Display: "  ", Input: "a"}}}, "wordFieldsRequired"},
		{"blank input", ListInput{Name: text("a"), Words: []Word{{Display: "a", Input: ""}}}, "wordFieldsRequired"},
		{"long name", ListInput{Name: text(strings.Repeat("a", MaxListName+1)), Words: word}, "invalidList"},
		{"long name in UTF-16", ListInput{Name: text(strings.Repeat("𩸽", MaxListName/2+1)), Words: word}, "invalidList"},
		{"many words", ListInput{Name: text("a"), Words: many}, "invalidList"},
		{"long display", ListInput{Name: text("a"), Words: []Word{{Display: strings.Repeat("a", MaxWordText+1), Input: "a"}}}, "invalidList"},
		{"long input", ListInput{Name: text("a"), Words: []Word{{Display: "a", Input: strings.Repeat("a", MaxWordText+1)}}}, "invalidList"},
		{"long annotation", ListInput{Name: text("a"), Words: []Word{{Display: "a", Input: "a", Annotation: strings.Repeat("a", MaxAnnotation+1)}}}, "invalidList"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := two()
			_, err := CreateList(w, c.input, "new", now)
			wantKey(t, err, c.key)
			if len(w.Lists) != 2 {
				t.Fatalf("lists = %+v", w.Lists)
			}
		})
	}
	// The longest allowed values pass.
	if _, err := CreateList(two(), ListInput{Name: text(strings.Repeat("𩸽", MaxListName/2)), Words: many[:MaxWords]}, "new", now); err != nil {
		t.Fatal(err)
	}
}

func TestCreateListLimit(t *testing.T) {
	w := &Workspace{}
	for range MaxLists {
		w.Lists = append(w.Lists, List{ID: NewID(), Name: NewID()})
	}
	_, err := CreateList(w, ListInput{Name: text("a"), Words: []Word{{Display: "a", Input: "a"}}}, "new", now)
	wantKey(t, err, "listLimit")
	if len(w.Lists) != MaxLists {
		t.Fatalf("lists = %d", len(w.Lists))
	}
	// Lists of a followed pack are not counted.
	w.Packs = []Pack{{ID: "f", Name: "F", Origin: &Origin{CatalogID: "c", Version: 1, Followed: true}, CreatedAt: packStamp}}
	w.Lists[0].PackID = "f"
	if _, err := CreateList(w, ListInput{Name: text("a"), Words: []Word{{Display: "a", Input: "a"}}}, "new", now); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateList(t *testing.T) {
	w := two()
	list, err := UpdateList(w, "l1", ListInput{Name: text(" English ")})
	if err != nil {
		t.Fatal(err)
	}
	if list != &w.Lists[0] || list.Name != "English" || list.Words[0].Display != "apple" || len(list.Records) != 1 ||
		list.CreatedAt != "2026-10-01T00:00:00.000Z" {
		t.Fatalf("list = %+v", list)
	}
	list, err = UpdateList(w, "l1", ListInput{Words: []Word{{Display: "b", Input: "b"}, {Display: "c", Input: "c"}}})
	if err != nil || list.Name != "English" || len(list.Words) != 2 || len(list.Records) != 1 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	// A list may keep its own name in another case.
	if list, err := UpdateList(w, "l2", ListInput{Name: text("FRUITS")}); err != nil || list.Name != "FRUITS" {
		t.Fatalf("list = %+v, %v", list, err)
	}
}

func TestUpdateListErrors(t *testing.T) {
	w := two()
	_, err := UpdateList(w, "missing", ListInput{Name: text("a")})
	wantKey(t, err, "listNotFound")
	_, err = UpdateList(w, "l1", ListInput{Words: []Word{}})
	wantKey(t, err, "wordsRequired")
	_, err = UpdateList(w, "l1", ListInput{Name: text("fruits")})
	wantKey(t, err, "listNameDuplicate")
	_, err = UpdateList(w, "l1", ListInput{Name: text(" ")})
	wantKey(t, err, "listNameRequired")
	if w.Lists[0].Name != "英単語" || len(w.Lists[0].Words) != 1 {
		t.Fatalf("list = %+v", w.Lists[0])
	}
}

func TestDeleteList(t *testing.T) {
	w := two()
	if err := DeleteList(w, "l1"); err != nil {
		t.Fatal(err)
	}
	if len(w.Lists) != 1 || w.Lists[0].ID != "l2" {
		t.Fatalf("lists = %+v", w.Lists)
	}
	wantKey(t, DeleteList(w, "l1"), "listNotFound")
}

// Postgres cannot store U+0000 in jsonb, so it is refused as invalid rather than failing the save.
func TestCreateListRefusesNUL(t *testing.T) {
	for _, input := range []ListInput{
		{Name: text("a\x00"), Words: []Word{{Display: "a", Input: "a"}}},
		{Name: text("a"), Words: []Word{{Display: "a\x00", Input: "a"}}},
		{Name: text("a"), Words: []Word{{Display: "a", Input: "\x00a"}}},
		{Name: text("a"), Words: []Word{{Display: "a", Input: "a", Annotation: "\x00"}}},
	} {
		w := two()
		_, err := CreateList(w, input, "new", now)
		wantKey(t, err, "invalidList")
	}
	_, err := UpdateList(two(), "l1", ListInput{Words: []Word{{Display: "a", Input: "a", Annotation: "\x00"}}})
	wantKey(t, err, "invalidList")
}

// Names are compared as the app's saveList does, with JavaScript's toLowerCase. σ is \u03c3 and the final ς is \u03c2.
func TestListNamesCompareAsJavaScript(t *testing.T) {
	cases := []struct {
		existing, name string
		duplicate      bool
	}{
		{"\u03b1\u03c2", "\u0391\u03a3", true},             // ΑΣ lowercases to ας, as JavaScript does at the end of a word.
		{"\u03b1\u03c3", "\u0391\u03a3", false},            // ...so it is not ασ.
		{"\u03b1\u03c3\u03b1", "\u0391\u03a3\u0391", true}, // Inside a word Σ is σ.
		{"\u03c3", "\u03a3", true},                         // A lone Σ is not final.
		{"i", "\u0130", false},                             // JavaScript lowercases İ to i and a combining dot above.
		{"i\u0307", "\u0130", true},
		{"Apple", " APPLE ", true},
	}
	for _, c := range cases {
		w := &Workspace{Lists: []List{{ID: "x", Name: c.existing, Words: []Word{{Display: "a", Input: "a"}}}}}
		_, err := CreateList(w, ListInput{Name: text(c.name), Words: []Word{{Display: "a", Input: "a"}}}, "new", now)
		if c.duplicate {
			wantKey(t, err, "listNameDuplicate")
		} else if err != nil {
			t.Errorf("%q next to %q: %v", c.name, c.existing, err)
		}
	}
}

// The expected values are what Node's toLowerCase gives.
func TestLowerCase(t *testing.T) {
	cases := map[string]string{
		"\u039f\u0394\u039f\u03a3":              "\u03bf\u03b4\u03bf\u03c2", // ΟΔΟΣ → οδος
		"\u039f\u0394\u039f\u03a3 \u0391\u03a3": "\u03bf\u03b4\u03bf\u03c2 \u03b1\u03c2",
		"\u0391\u03a3.":                         "\u03b1\u03c2.",       // . can follow a final Σ
		"\u0391\u03a3'\u0392":                   "\u03b1\u03c3'\u03b2", // ' inside a word does not end it
		"\u0391\u03a3:\u0392":                   "\u03b1\u03c3:\u03b2",
		"\u0391\u03a3\u0301":                    "\u03b1\u03c2\u0301", // a combining accent is ignored
		"\u0391\u03a31":                         "\u03b1\u03c21",      // a digit is not a letter
		"1\u03a3":                               "1\u03c3",            // nothing cased before it
		"\u03a3":                                "\u03c3",
		"A\u02bc\u00ad\u03a3":                   "a\u02bc\u00ad\u03c2", // modifier letters and soft hyphens are ignored
		"\u0130stanbul":                         "i\u0307stanbul",
		"ABC":                                   "abc",
	}
	for input, want := range cases {
		if got := lowerCase(input); got != want {
			t.Errorf("lowerCase(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestListNameTrimsAsJavaScript(t *testing.T) {
	_, err := CreateList(two(), ListInput{Name: text(bom), Words: []Word{{Display: "a", Input: "a"}}}, "new", now)
	wantKey(t, err, "listNameRequired")
	_, err = CreateList(two(), ListInput{Name: text("a"), Words: []Word{{Display: bom, Input: "a"}}}, "new", now)
	wantKey(t, err, "wordFieldsRequired")
}

func TestListInputWriting(t *testing.T) {
	w := two()
	words := []Word{{Display: "a", Input: "a"}}
	list, err := CreateList(w, ListInput{Name: text("新"), Writing: &Writing{"ko"}, Words: words}, "new", now)
	if err != nil || list.Writing == nil || list.Writing.Language != "ko" {
		t.Fatalf("created = %+v, err = %v", list, err)
	}
	if list, err = UpdateList(w, "new", ListInput{Name: text("新2")}); err != nil || list.Writing == nil || list.Writing.Language != "ko" {
		t.Fatalf("nil changed it: %+v, %v", list, err)
	}
	if list, err = UpdateList(w, "new", ListInput{Writing: &Writing{"fr"}}); err != nil || list.Writing.Language != "fr" {
		t.Fatalf("changed = %+v, %v", list, err)
	}
	if list, err = UpdateList(w, "new", ListInput{Writing: &Writing{""}}); err != nil || list.Writing != nil {
		t.Fatalf("removed = %+v, %v", list, err)
	}
	for _, language := range WritingLanguages {
		if _, err := UpdateList(w, "new", ListInput{Writing: &Writing{language}}); err != nil {
			t.Fatalf("%s: %v", language, err)
		}
	}
	before := w.Lists[2].Writing
	_, err = UpdateList(w, "new", ListInput{Name: text("変更"), Writing: &Writing{"xx"}})
	wantKey(t, err, "invalidWritingLanguage")
	if w.Lists[2].Writing != before || w.Lists[2].Name != "新2" {
		t.Fatalf("refused update changed the list: %+v", w.Lists[2])
	}
	_, err = CreateList(w, ListInput{Name: text("別"), Writing: &Writing{"JA"}, Words: words}, "x", now)
	wantKey(t, err, "invalidWritingLanguage")
	if len(w.Lists) != 3 {
		t.Fatalf("lists = %d", len(w.Lists))
	}
	// A copy keeps the mark, as duplicateList does.
	if _, err := UpdateList(w, "new", ListInput{Writing: &Writing{"de"}}); err != nil {
		t.Fatal(err)
	}
	if list, err = CopyList(w, "new", nil, "copy", now); err != nil || list.Writing == nil || list.Writing.Language != "de" || list.Writing == w.Lists[2].Writing {
		t.Fatalf("copy = %+v, %v", list, err)
	}
}

// fits counts as the app does, in UTF-16 code units, so a character outside the BMP takes two; U+0000 never fits.
func TestFits(t *testing.T) {
	for _, c := range []struct {
		text string
		max  int
		want bool
	}{
		{"", 0, true},
		{"abc", 3, true},
		{"abcd", 3, false},
		{"あいう", 3, true},
		{"😀", 2, true},
		{"😀", 1, false},
		{"a\x00", 5, false},
	} {
		if got := fits(c.text, c.max); got != c.want {
			t.Errorf("fits(%q, %d) = %v, want %v", c.text, c.max, got, c.want)
		}
	}
}
