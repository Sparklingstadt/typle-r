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
