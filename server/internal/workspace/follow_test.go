package workspace

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// officialOf reads the official packs of a fixture, in the shape the catalog holds them.
func officialOf(t *testing.T, data json.RawMessage) []OfficialPack {
	t.Helper()
	var raw []struct {
		CatalogID string          `json:"catalogId"`
		Version   int             `json:"version"`
		Pack      json.RawMessage `json:"pack"`
		Lists     json.RawMessage `json:"lists"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	official := make([]OfficialPack, 0, len(raw))
	for _, item := range raw {
		packs, err := decodePacks([]byte("[" + string(item.Pack) + "]"))
		if err != nil {
			t.Fatal(err)
		}
		lists, err := DecodeLists(item.Lists)
		if err != nil {
			t.Fatal(err)
		}
		official = append(official, OfficialPack{CatalogID: item.CatalogID, Version: item.Version, Pack: packs[0], Lists: lists})
	}
	return official
}

// The fixtures are shared with tests/followedPacks.test.cjs, so Go follows the catalog as the app does.
func TestFollowFixtures(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "..", "..", "tests", "fixtures", "follow", "*.json"))
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
				Official json.RawMessage
				Library  struct{ Lists, Packs json.RawMessage }
				Expected struct{ Lists, Packs json.RawMessage }
			}
			if err := json.Unmarshal(data, &fixture); err != nil {
				t.Fatal(err)
			}
			official := officialOf(t, fixture.Official)
			var packs []byte
			if string(fixture.Library.Packs) != "null" {
				packs = fixture.Library.Packs
			}
			w, err := decode(fixture.Library.Lists, []byte("[]"), packs, official)
			if err != nil {
				t.Fatal(err)
			}
			lists, encodedPacks := encodeBoth(t, w)
			sameJSON(t, "lists", lists, fixture.Expected.Lists)
			sameJSON(t, "packs", encodedPacks, fixture.Expected.Packs)
			if err := CheckPacks(w.Packs, stored(t, lists)); err != nil {
				t.Fatalf("CheckPacks: %v", err)
			}
			// Reading the result again changes nothing.
			again, err := decode(lists, []byte("[]"), encodedPacks, official)
			if err != nil {
				t.Fatal(err)
			}
			againLists, againPacks := encodeBoth(t, again)
			sameJSON(t, "lists again", againLists, lists)
			sameJSON(t, "packs again", againPacks, encodedPacks)
		})
	}
}

func TestOfficialPacks(t *testing.T) {
	official, err := OfficialPacks()
	if err != nil {
		t.Fatal(err)
	}
	// The same catalog ids, in the same order, as officialPacks() in src/plugins/packs/catalog.ts.
	if len(official) != 35 || official[0].CatalogID != "pack-8f3cf116-1f9f-4579-a071-e600094b104d" ||
		official[1].CatalogID != "pack-ef974a4b-3c7a-4eeb-9979-6721a0a1c81a" {
		t.Fatalf("official = %d packs, first %v", len(official), official[:min(2, len(official))])
	}
	count := 0
	for _, entry := range official {
		if entry.Version != 1 || entry.Pack.ID != entry.CatalogID || entry.Pack.Origin == nil ||
			*entry.Pack.Origin != (Origin{CatalogID: entry.CatalogID, Version: 1}) || len(entry.Lists) == 0 {
			t.Fatalf("entry %s: version %d, pack %+v, %d lists", entry.CatalogID, entry.Version, entry.Pack, len(entry.Lists))
		}
		for _, list := range entry.Lists {
			if list.PackID != entry.CatalogID || len(list.Records) != 0 || list.Records == nil || list.Origin != nil {
				t.Fatalf("list %s of %s: %+v", list.ID, entry.CatalogID, list)
			}
		}
		count += len(entry.Lists)
	}
	// The 66 existing lists are followed by six beginner language lists.
	if count != 72 || official[0].Lists[0].ID != "8f3cf116-1f9f-4579-a071-e600094b104d" {
		t.Fatalf("%d lists, first %s", count, official[0].Lists[0].ID)
	}
	// The group Arch Linuxコマンド is named after the list arch-linux, which comes first and has no group.
	at := slices.IndexFunc(official, func(entry OfficialPack) bool {
		return slices.ContainsFunc(entry.Lists, func(list List) bool { return list.ID == "arch-linux-beginner" })
	})
	if at < 0 || official[at].Pack.Name != "Arch Linuxコマンド（2）" || official[at].Pack.Category != "プログラミング" ||
		!slices.ContainsFunc(official[at].Lists, func(list List) bool { return list.ID == "arch-linux-advanced" }) {
		t.Fatalf("arch linux = %+v", official[max(at, 0)].Pack)
	}
	// The packs and lists together are a library that can be saved.
	var packs []Pack
	var lists []List
	for _, entry := range official {
		packs = append(packs, entry.Pack)
		lists = append(lists, entry.Lists...)
	}
	encoded, err := Encode(lists)
	if err != nil {
		t.Fatal(err)
	}
	if err := CheckPacks(packs, stored(t, encoded)); err != nil {
		t.Fatal(err)
	}
	// Each call gives its own copy.
	official[0].Lists[0].Words[0].Display = "changed"
	again, _ := OfficialPacks()
	if again[0].Lists[0].Words[0].Display == "changed" {
		t.Fatal("OfficialPacks shares its data")
	}
}

// Decode follows the real catalog: copies from before v0.98.0 go, followed packs are kept equal to the catalog.
func TestDecodeFollowsTheCatalog(t *testing.T) {
	official, err := OfficialPacks()
	if err != nil {
		t.Fatal(err)
	}
	first := official[0]
	packs := `[{"id":"` + first.CatalogID + `","name":"Old","createdAt":"2026-10-01T00:00:00.000Z"},
	  {"id":"f","name":"Mine","description":"old","origin":{"catalogId":"` + first.CatalogID + `","version":1,"followed":true},"createdAt":"2026-10-01T00:00:00.000Z"},
	  {"id":"own","name":"Own","createdAt":"2026-10-01T00:00:00.000Z"}]`
	lists := `[{"id":"old","name":"Old","packId":"` + first.CatalogID + `","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]},
	  {"id":"fl","name":"Old","packId":"f","origin":{"listId":"` + first.Lists[0].ID + `"},"createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],
	    "records":[{"time":1,"date":"2026-10-02T00:00:00.000Z"}]},
	  {"id":"o","name":"Own","packId":"own","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`
	w, err := Decode([]byte(lists), []byte("[]"), []byte(packs))
	if err != nil {
		t.Fatal(err)
	}
	if ids := packIDs(w); !slices.Equal(ids, []string{"f", "own"}) {
		t.Fatalf("packs = %v", ids)
	}
	followed := w.Packs[0]
	if followed.Name != "Mine" || followed.Description != first.Pack.Description || followed.Category != first.Pack.Category ||
		!slices.Equal(followed.Tags, first.Pack.Tags) || *followed.Origin != (Origin{CatalogID: first.CatalogID, Version: 1, Followed: true}) {
		t.Fatalf("followed = %+v", followed)
	}
	mine := slices.DeleteFunc(slices.Clone(w.Lists), func(list List) bool { return list.PackID != "f" })
	if len(mine) != len(first.Lists) || mine[0].ID != "fl" || len(mine[0].Records) != 1 || mine[0].Name != first.Lists[0].Name ||
		!slices.Equal(mine[0].Words, first.Lists[0].Words) || mine[0].Category != first.Pack.Category {
		t.Fatalf("lists = %+v", mine)
	}
	for _, list := range mine[1:] {
		if !strings.HasPrefix(list.ID, "f:") || list.Origin == nil || list.ID != "f:"+list.Origin.ListID {
			t.Fatalf("list = %+v", list)
		}
	}
	if w.Lists[len(w.Lists)-1].ID != "o" {
		t.Fatalf("lists = %v", listIDs(w))
	}
}

func TestDecodeReadsFollowedOrigins(t *testing.T) {
	list := `[{"id":"a","name":"a","packId":"p","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`
	pack := func(origin string) []byte {
		return []byte(`[{"id":"p","name":"P","createdAt":"x","origin":{"catalogId":"c","version":1` + origin + `}}]`)
	}
	// An origin without followed is a copy from before v0.98.0, which is removed; followed: true is the only other value.
	for _, followed := range []string{``, `,"followed":null`} {
		w, err := Decode([]byte(list), []byte("[]"), pack(followed))
		if err != nil || len(w.Packs) != 0 || len(w.Lists) != 0 {
			t.Fatalf("%s: %+v, %v", followed, w, err)
		}
	}
	for _, followed := range []string{`,"followed":false`, `,"followed":"yes"`, `,"followed":1`} {
		if _, err := Decode([]byte(list), []byte("[]"), pack(followed)); err == nil {
			t.Errorf("%s was read", followed)
		}
	}
	// A followed origin is written back with followed.
	encoded, err := EncodePacks([]Pack{{ID: "p", Name: "P", Origin: &Origin{CatalogID: "c", Version: 1, Followed: true}, CreatedAt: "x"}})
	if err != nil || string(encoded) != `[{"id":"p","name":"P","origin":{"catalogId":"c","version":1,"followed":true},"createdAt":"x"}]` {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
}

// decodeLists keeps a list origin with a string listId (and the fields Typle does not know in it), and drops any other.
func TestDecodeListOrigin(t *testing.T) {
	read := func(origin string) List {
		t.Helper()
		lists, err := DecodeLists([]byte(`[{"id":"a","name":"a",` + origin + `"createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]}]`))
		if err != nil {
			t.Fatal(err)
		}
		return lists[0]
	}
	if got := read(`"origin":{"listId":"x"},`); got.Origin == nil || *got.Origin != (ListOrigin{ListID: "x"}) || got.Extra != "" {
		t.Fatalf("list = %+v", got)
	}
	for _, bad := range []string{`null`, `"x"`, `{}`, `{"listId":1}`, `[]`, `{"listId":null}`} {
		if got := read(`"origin":` + bad + `,`); got.Origin != nil || got.Extra != "" {
			t.Errorf("%s: list = %+v", bad, got)
		}
	}
	kept := read(`"origin":{"listId":"x","memo":1},`)
	encoded, err := Encode([]List{kept})
	if err != nil || !strings.Contains(string(encoded), `"origin":{"listId":"x","memo":1}`) {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
	encoded, err = Encode([]List{read(``)})
	if err != nil || strings.Contains(string(encoded), `origin`) {
		t.Fatalf("encoded = %s, %v", encoded, err)
	}
}

// followedLibrary is a library with the followed pack f (lists f1, f2) and the pack q of its own (list g).
func followedLibrary() *Workspace {
	w := &Workspace{
		Packs: []Pack{
			{ID: "f", Name: "Go", Description: "D", Origin: &Origin{CatalogID: "go", Version: 1, Followed: true}, CreatedAt: packStamp},
			{ID: "q", Name: "Mine", CreatedAt: packStamp},
		},
		Lists: []List{
			{ID: "f1", Name: "基本", PackID: "f", Levels: []string{"基本"}, Words: packWordsOf("go"), Records: []Record{}, CreatedAt: packStamp,
				Origin: &ListOrigin{ListID: "basic"}},
			{ID: "g", Name: "G", PackID: "q", Words: packWordsOf("g"), Records: []Record{}, CreatedAt: packStamp},
			{ID: "f2", Name: "応用", PackID: "f", Levels: []string{"応用"}, Words: packWordsOf("run"), Records: []Record{}, CreatedAt: packStamp,
				Origin: &ListOrigin{ListID: "advanced"}},
		},
		Devices: []Device{},
	}
	viewLists(w)
	return w
}

func TestEditsOfFollowedPacksAreRefused(t *testing.T) {
	name := text("New")
	f, q := "f", "q"
	for label, change := range map[string]func(w *Workspace) error{
		"update pack": func(w *Workspace) error { _, err := UpdatePack(w, "f", PackInput{Name: name}); return err },
		"reorder pack": func(w *Workspace) error {
			_, err := UpdatePack(w, "f", PackInput{ListOrder: &[]string{"f2", "f1"}})
			return err
		},
		"create list": func(w *Workspace) error {
			_, err := CreateList(w, ListInput{Name: name, PackID: &f, Words: packWordsOf("x")}, "n", packNow)
			return err
		},
		"update list":   func(w *Workspace) error { _, err := UpdateList(w, "f1", ListInput{Name: name}); return err },
		"move list out": func(w *Workspace) error { _, err := UpdateList(w, "f1", ListInput{PackID: &q}); return err },
		"move list in":  func(w *Workspace) error { _, err := UpdateList(w, "g", ListInput{PackID: &f}); return err },
		"delete list":   func(w *Workspace) error { return DeleteList(w, "f1") },
		"copy list":     func(w *Workspace) error { _, err := CopyList(w, "f1", nil, "n", packNow); return err },
	} {
		w := followedLibrary()
		before := followedLibrary()
		var refused *Error
		if err := change(w); !errors.As(err, &refused) || refused.Key != "packFollowed" {
			t.Errorf("%s: %v", label, err)
		}
		unchanged(t, w, before)
	}
	// What is not found is still not found.
	w := followedLibrary()
	if _, err := UpdatePack(w, "missing", PackInput{Name: name}); err == nil || err.Error() != "packNotFound" {
		t.Errorf("update missing pack: %v", err)
	}
	if err := DeleteList(w, "missing"); err == nil || err.Error() != "listNotFound" {
		t.Errorf("delete missing list: %v", err)
	}
}

func TestFollowedPacksCanBeDeletedCopiedAndPracticed(t *testing.T) {
	w := followedLibrary()
	pack, err := CopyPack(w, "f", nil, "c", []string{"c1", "c2"}, packNow)
	if err != nil {
		t.Fatal(err)
	}
	if pack.Origin != nil || pack.Description != "D" {
		t.Fatalf("copy = %+v", pack)
	}
	for _, list := range w.Lists {
		if list.PackID == "c" && list.Origin != nil {
			t.Fatalf("copied list = %+v", list)
		}
	}
	valid(t, w)
	if _, _, err := AddRecord(w, "f1", RecordInput{Time: float(3), Date: text("2026-10-26T00:00:00.000Z"), Mistakes: float(0), Accuracy: float(100)}, "r"); err != nil {
		t.Fatal(err)
	}
	if err := DeletePack(w, "f"); err != nil {
		t.Fatal(err)
	}
	if ids := packIDs(w); !slices.Equal(ids, []string{"c", "q"}) {
		t.Fatalf("packs = %v", ids)
	}
}
