package store

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// galleryRow inserts a share of the owner whose snapshot has the given pack fields and lists of n words each. listed
// and hidden are the times to set, or nil.
type galleryRow struct {
	pack           map[string]any
	words          []int
	listed, hidden *time.Time
}

func insertShare(t *testing.T, conn *pgx.Conn, owner string, n int, row galleryRow) string {
	t.Helper()
	lists := []map[string]any{}
	for i, count := range row.words {
		words := make([]map[string]any, count)
		for j := range words {
			words[j] = map[string]any{"display": fmt.Sprint(j)}
		}
		lists = append(lists, map[string]any{"name": fmt.Sprint("list", i), "words": words})
	}
	data, err := json.Marshal(map[string]any{"format": "typle-pack", "version": 1, "pack": row.pack, "lists": lists})
	if err != nil {
		t.Fatal(err)
	}
	id := workspace.NewID()
	if _, err := conn.Exec(context.Background(), `INSERT INTO typle_shared_packs (id, owner_id, pack_id, data, listed_at, hidden_at)
		VALUES ($1, $2, $3, $4::jsonb, $5, $6)`, id, owner, fmt.Sprint("p", n), string(data), row.listed, row.hidden); err != nil {
		t.Fatal(err)
	}
	return id
}

func listedIn(offset time.Duration) *time.Time {
	at := time.Now().Add(offset)
	return &at
}

func galleryIDs(t *testing.T, s *Store, q GalleryQuery) []string {
	t.Helper()
	page, err := s.Gallery(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, pack := range page.Packs {
		ids = append(ids, pack.ID)
	}
	return ids
}

func TestGallerySearch(t *testing.T) {
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	mark := "検索" + id
	byName := insertShare(t, conn, id, 1, galleryRow{pack: map[string]any{"name": "名前に" + mark}, listed: listedIn(0)})
	byDescription := insertShare(t, conn, id, 2, galleryRow{pack: map[string]any{"name": "x", "description": "説明に" + mark}, listed: listedIn(0)})
	byTag := insertShare(t, conn, id, 3, galleryRow{pack: map[string]any{"name": "y", "tags": []string{"a", "タグに" + mark}}, listed: listedIn(0)})
	insertShare(t, conn, id, 4, galleryRow{pack: map[string]any{"name": "z", "description": "関係ない"}, listed: listedIn(0)})

	got := galleryIDs(t, s, GalleryQuery{Text: mark, Sort: GalleryNew, Page: 1})
	for _, want := range []string{byName, byDescription, byTag} {
		if !slices.Contains(got, want) {
			t.Errorf("%s missing from %v", want, got)
		}
	}
	if len(got) != 3 {
		t.Errorf("got = %v", got)
	}

	upper := insertShare(t, conn, id, 5, galleryRow{pack: map[string]any{"name": "ABCdef" + id}, listed: listedIn(0)})
	got = galleryIDs(t, s, GalleryQuery{Text: "abcDEF" + id, Sort: GalleryNew, Page: 1})
	if !slices.Equal(got, []string{upper}) {
		t.Errorf("case-insensitive = %v, want %s", got, upper)
	}
}

func TestGalleryEscapesWildcards(t *testing.T) {
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	// Each wildcard has a plain pack that the search would also find if the character were not escaped.
	listed := func(n int, name string) string {
		return insertShare(t, conn, id, n, galleryRow{pack: map[string]any{"name": name}, listed: listedIn(0)})
	}
	percent, plainPercent := listed(1, "100%"+id), listed(2, "100x"+id)
	underscore, plainUnderscore := listed(3, "a_"+id), listed(4, "ab"+id)
	backslash, plainBackslash := listed(5, `c\`+id), listed(6, "cd"+id)

	// Unescaped, "%"+id and "_"+id match the plain names, and a backslash makes the next character literal.
	for _, c := range []struct{ text, want, plain string }{
		{"%" + id, percent, plainPercent},
		{"_" + id, underscore, plainUnderscore},
		{`\` + id, backslash, plainBackslash},
	} {
		got := galleryIDs(t, s, GalleryQuery{Text: c.text, Sort: GalleryNew, Page: 1})
		if !slices.Equal(got, []string{c.want}) {
			t.Errorf("Text %q = %v, want only %s (not %s)", c.text, got, c.want, c.plain)
		}
	}
	// A lone wildcard matches only the names that contain it, not every pack.
	for text, c := range map[string][2]string{"%": {percent, plainPercent}, "_": {underscore, plainUnderscore}} {
		got := galleryIDs(t, s, GalleryQuery{Text: text, Sort: GalleryNew, Page: 1})
		if !slices.Contains(got, c[0]) || slices.Contains(got, c[1]) {
			t.Errorf("Text %q = %v, want %s without %s", text, got, c[0], c[1])
		}
	}
}

func TestGalleryCategoryAndSort(t *testing.T) {
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	category := "カテゴリー" + id
	old := insertShare(t, conn, id, 1, galleryRow{pack: map[string]any{"name": "old", "category": category}, listed: listedIn(-3 * time.Hour)})
	middle := insertShare(t, conn, id, 2, galleryRow{pack: map[string]any{"name": "middle", "category": category}, listed: listedIn(-2 * time.Hour)})
	newest := insertShare(t, conn, id, 3, galleryRow{pack: map[string]any{"name": "newest", "category": category}, listed: listedIn(-time.Hour)})
	insertShare(t, conn, id, 4, galleryRow{pack: map[string]any{"name": "other", "category": category + "別"}, listed: listedIn(0)})
	insertShare(t, conn, id, 5, galleryRow{pack: map[string]any{"name": "none"}, listed: listedIn(0)})
	for share, count := range map[string]int{old: 3, middle: 1} {
		if _, err := conn.Exec(context.Background(), `UPDATE typle_shared_packs SET add_count = $2 WHERE id = $1`, share, count); err != nil {
			t.Fatal(err)
		}
	}

	if got := galleryIDs(t, s, GalleryQuery{Category: category, Sort: GalleryNew, Page: 1}); !slices.Equal(got, []string{newest, middle, old}) {
		t.Errorf("new = %v", got)
	}
	if got := galleryIDs(t, s, GalleryQuery{Category: category, Sort: GalleryPopular, Page: 1}); !slices.Equal(got, []string{old, middle, newest}) {
		t.Errorf("popular = %v", got)
	}
	page, err := s.Gallery(context.Background(), GalleryQuery{Category: category, Sort: GalleryPopular, Page: 1})
	if err != nil || page.Packs[0].Added != 3 || page.Packs[0].Category != category {
		t.Errorf("page = %+v, %v", page, err)
	}
}

func TestGalleryPaging(t *testing.T) {
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	category := "ページ" + id
	for i := range GalleryPageSize + 1 {
		insertShare(t, conn, id, i, galleryRow{pack: map[string]any{"name": fmt.Sprint("p", i), "category": category},
			listed: listedIn(-time.Duration(i) * time.Minute)})
	}
	first, err := s.Gallery(context.Background(), GalleryQuery{Category: category, Sort: GalleryNew, Page: 1})
	if err != nil || len(first.Packs) != GalleryPageSize || !first.More {
		t.Fatalf("page 1 = %d packs, more %v, %v", len(first.Packs), first.More, err)
	}
	second, err := s.Gallery(context.Background(), GalleryQuery{Category: category, Sort: GalleryNew, Page: 2})
	if err != nil || len(second.Packs) != 1 || second.More || second.Packs[0].Name != "p20" {
		t.Fatalf("page 2 = %+v, %v", second, err)
	}
	third, err := s.Gallery(context.Background(), GalleryQuery{Category: category, Sort: GalleryNew, Page: 3})
	if err != nil || third.Packs == nil || len(third.Packs) != 0 || third.More {
		t.Fatalf("page 3 = %+v, %v", third, err)
	}
}

func TestGalleryExcludes(t *testing.T) {
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	category := "除外" + id
	shown := insertShare(t, conn, id, 1, galleryRow{pack: map[string]any{"name": "a", "category": category}, listed: listedIn(0)})
	insertShare(t, conn, id, 2, galleryRow{pack: map[string]any{"name": "b", "category": category}})
	insertShare(t, conn, id, 3, galleryRow{pack: map[string]any{"name": "c", "category": category}, listed: listedIn(0), hidden: listedIn(0)})
	if got := galleryIDs(t, s, GalleryQuery{Category: category, Sort: GalleryNew, Page: 1}); !slices.Equal(got, []string{shown}) {
		t.Errorf("got = %v, want [%s]", got, shown)
	}
}

func TestGalleryPackWithoutLabels(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	pack := w.Packs[0].ID
	name := "ラベルなし" + id
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.UpdatePack(w, pack, workspace.PackInput{Name: &name})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	yes := true
	share, err := s.PutShare(ctx, id, pack, &yes)
	if err != nil {
		t.Fatal(err)
	}
	page, err := s.Gallery(ctx, GalleryQuery{Text: id, Sort: GalleryNew, Page: 1})
	if err != nil {
		t.Fatal(err)
	}
	var got *GalleryPack
	for i := range page.Packs {
		if page.Packs[i].ID == share.ID {
			got = &page.Packs[i]
		}
	}
	if got == nil {
		t.Fatalf("%s not in %+v", share.ID, page.Packs)
	}
	if got.Description != "" || got.Category != "" || got.Tags != nil || got.Name != name {
		t.Errorf("pack = %+v", got)
	}

	// Counted lists and words, and a snapshot with no lists at all.
	counted := insertShare(t, conn, id, 7, galleryRow{pack: map[string]any{"name": "counted" + id}, words: []int{2, 0, 3}, listed: listedIn(0)})
	empty := insertShare(t, conn, id, 8, galleryRow{pack: map[string]any{"name": "empty" + id}, listed: listedIn(0)})
	for share, want := range map[string][2]int{counted: {3, 5}, empty: {0, 0}} {
		page, err := s.Gallery(ctx, GalleryQuery{Text: id, Sort: GalleryNew, Page: 1})
		if err != nil {
			t.Fatal(err)
		}
		i := slices.IndexFunc(page.Packs, func(p GalleryPack) bool { return p.ID == share })
		if i < 0 || page.Packs[i].Lists != want[0] || page.Packs[i].Words != want[1] {
			t.Errorf("%s = %+v, want lists/words %v", share, page.Packs, want)
		}
	}
}

func TestGalleryCategories(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	many, few, unlisted, hidden := "多い"+id, "少ない"+id, "未掲載"+id, "非公開"+id
	n := 0
	add := func(category string, listed, hide bool) {
		n++
		row := galleryRow{pack: map[string]any{"name": "n"}}
		if category != "" {
			row.pack["category"] = category
		}
		if listed {
			row.listed = listedIn(0)
		}
		if hide {
			row.hidden = listedIn(0)
		}
		insertShare(t, conn, id, n, row)
	}
	add(many, true, false)
	add(many, true, false)
	add(few, true, false)
	add(unlisted, false, false)
	add(hidden, true, true)
	add("", true, false)

	categories, err := s.GalleryCategories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	count := map[string]int{}
	position := map[string]int{}
	for i, category := range categories {
		count[category.Name] = category.Count
		position[category.Name] = i
		if category.Name == "" {
			t.Errorf("empty category in %v", categories)
		}
	}
	if count[many] != 2 || count[few] != 1 || position[many] > position[few] {
		t.Errorf("many %d at %d, few %d at %d", count[many], position[many], count[few], position[few])
	}
	if _, ok := count[unlisted]; ok {
		t.Errorf("unlisted counted")
	}
	if _, ok := count[hidden]; ok {
		t.Errorf("hidden counted")
	}
	if !slices.IsSortedFunc(categories, func(a, b GalleryCategory) int {
		if a.Count != b.Count {
			return b.Count - a.Count
		}
		return workspace.CompareNames(a.Name, b.Name, false)
	}) {
		t.Errorf("not sorted: %v", categories)
	}
}

func TestCountAddedOnlyListed(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	listed := insertShare(t, conn, id, 1, galleryRow{pack: map[string]any{"name": "a"}, listed: listedIn(0)})
	unlisted := insertShare(t, conn, id, 2, galleryRow{pack: map[string]any{"name": "b"}})
	hidden := insertShare(t, conn, id, 3, galleryRow{pack: map[string]any{"name": "c"}, listed: listedIn(0), hidden: listedIn(0)})
	added := func(share string) int {
		var count int
		if err := conn.QueryRow(ctx, `SELECT add_count FROM typle_shared_packs WHERE id = $1`, share).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	for _, share := range []string{listed, unlisted, hidden, workspace.NewID(), "not-a-uuid"} {
		if err := s.CountAdded(ctx, share); err != nil {
			t.Errorf("CountAdded(%q): %v", share, err)
		}
	}
	if added(listed) != 1 || added(unlisted) != 0 || added(hidden) != 0 {
		t.Errorf("counts = %d %d %d", added(listed), added(unlisted), added(hidden))
	}
}

func reportRows(t *testing.T, conn *pgx.Conn, share string) int {
	t.Helper()
	var n int
	if err := conn.QueryRow(context.Background(), `SELECT count(*)::int FROM typle_gallery_reports WHERE share_id = $1`, share).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestReport(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	listed := insertShare(t, conn, id, 1, galleryRow{pack: map[string]any{"name": "a"}, listed: listedIn(0)})
	unlisted := insertShare(t, conn, id, 2, galleryRow{pack: map[string]any{"name": "b"}})
	hidden := insertShare(t, conn, id, 3, galleryRow{pack: map[string]any{"name": "c"}, listed: listedIn(0), hidden: listedIn(0)})

	if ok, err := s.Report(ctx, listed, "spam"); err != nil || !ok {
		t.Fatalf("Report(listed) = %v, %v", ok, err)
	}
	if n := reportRows(t, conn, listed); n != 1 {
		t.Errorf("rows = %d, want 1", n)
	}
	for _, target := range []string{unlisted, hidden, workspace.NewID(), "x"} {
		if ok, err := s.Report(ctx, target, "spam"); err != nil || ok {
			t.Errorf("Report(%q) = %v, %v; want false, nil", target, ok, err)
		}
	}
	if reportRows(t, conn, unlisted) != 0 || reportRows(t, conn, hidden) != 0 {
		t.Error("a report was recorded for an unlisted or hidden share")
	}
}

func TestReportsGoWithShare(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	pack := w.Packs[0].ID
	yes := true
	share, err := s.PutShare(ctx, id, pack, &yes)
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := s.Report(ctx, share.ID, "other"); err != nil || !ok {
		t.Fatalf("Report = %v, %v", ok, err)
	}
	if err := s.DeleteShare(ctx, id, pack); err != nil {
		t.Fatal(err)
	}
	if n := reportRows(t, conn, share.ID); n != 0 {
		t.Errorf("rows = %d, want 0", n)
	}
}

func TestAdminGallery(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	category := "管理" + id
	pack := func(name string) map[string]any { return map[string]any{"name": name, "category": category} }
	// Every share the test looks for has a report, so it ranks above the shares without one that other tests leave in
	// the shared database and cannot be pushed out of the first AdminGalleryRows.
	many := insertShare(t, conn, id, 1, galleryRow{pack: pack("many"), listed: listedIn(-time.Hour)})
	newer := insertShare(t, conn, id, 2, galleryRow{pack: pack("newer"), listed: listedIn(-5 * time.Hour)})
	older := insertShare(t, conn, id, 3, galleryRow{pack: pack("older"), listed: listedIn(-4 * time.Hour)})
	listedNew := insertShare(t, conn, id, 4, galleryRow{pack: pack("listedNew"), listed: listedIn(-2 * time.Hour)})
	hidden := insertShare(t, conn, id, 5, galleryRow{pack: pack("hidden"), listed: listedIn(-3 * time.Hour), hidden: listedIn(0)})
	// Hiding a share that was never listed still shows it, after the listed ones.
	hiddenOnly := insertShare(t, conn, id, 6, galleryRow{pack: pack("hiddenOnly"), hidden: listedIn(0)})
	linkOnly := insertShare(t, conn, id, 7, galleryRow{pack: pack("linkOnly")})

	// Reports are inserted directly (Report refuses hidden shares), each at a fixed time: three for many, two for newer
	// and older (newer has the more recent last report), and one each for the rest at the same time, so that only
	// listed_at (the newest first, a share never listed last) tells them apart.
	base := time.Now().Add(-time.Hour)
	for _, r := range []struct {
		share, reason string
		at            time.Time
	}{
		{many, "spam", base.Add(-30 * time.Minute)}, {many, "spam", base.Add(-20 * time.Minute)}, {many, "inappropriate", base.Add(-10 * time.Minute)},
		{newer, "other", base.Add(-40 * time.Minute)}, {newer, "spam", base.Add(-5 * time.Minute)},
		{older, "other", base.Add(-50 * time.Minute)}, {older, "spam", base.Add(-6 * time.Minute)},
		{listedNew, "other", base}, {hidden, "personalInfo", base}, {hiddenOnly, "other", base},
	} {
		if _, err := conn.Exec(ctx, `INSERT INTO typle_gallery_reports (id, share_id, reason, created_at) VALUES ($1, $2, $3, $4)`,
			workspace.NewID(), r.share, r.reason, r.at); err != nil {
			t.Fatal(err)
		}
	}

	packs, err := s.AdminGallery(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(packs) > AdminGalleryRows {
		t.Errorf("rows = %d, want at most %d", len(packs), AdminGalleryRows)
	}
	index := map[string]int{}
	byID := map[string]AdminGalleryPack{}
	for i, p := range packs {
		index[p.ID] = i
		byID[p.ID] = p
	}
	order := []string{many, newer, older, listedNew, hidden, hiddenOnly}
	for i, share := range order {
		if _, ok := byID[share]; !ok {
			t.Fatalf("%s missing from the admin gallery", share)
		}
		if i > 0 && index[order[i-1]] >= index[share] {
			t.Errorf("order: %s (%d) should come before %s (%d)", order[i-1], index[order[i-1]], share, index[share])
		}
	}
	if _, ok := byID[linkOnly]; ok {
		t.Error("a link-only share is in the admin gallery")
	}
	got := byID[many]
	if got.Reports != 3 || got.Reasons["spam"] != 2 || got.Reasons["inappropriate"] != 1 || len(got.Reasons) != 2 ||
		got.Name != "many" || got.Category != category || got.ListedAt == nil || got.HiddenAt != nil {
		t.Errorf("many = %+v", got)
	}
	if h := byID[hidden]; h.HiddenAt == nil || h.ListedAt == nil || h.Reports != 1 || h.Reasons["personalInfo"] != 1 {
		t.Errorf("hidden = %+v", h)
	}
	if h := byID[hiddenOnly]; h.HiddenAt == nil || h.ListedAt != nil {
		t.Errorf("hiddenOnly = %+v", h)
	}
}

func hiddenAt(t *testing.T, conn *pgx.Conn, id string) *time.Time {
	t.Helper()
	var at *time.Time
	if err := conn.QueryRow(context.Background(), `SELECT hidden_at FROM typle_shared_packs WHERE id = $1`, id).Scan(&at); err != nil {
		t.Fatal(err)
	}
	return at
}

func TestSetHidden(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w := saved(t, s, id)
	name := "非公開" + id
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.UpdatePack(w, w.Packs[0].ID, workspace.PackInput{Name: &name})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	yes := true
	shared, err := s.PutShare(ctx, id, w.Packs[0].ID, &yes)
	if err != nil {
		t.Fatal(err)
	}
	share := shared.ID
	query := GalleryQuery{Text: name, Sort: GalleryNew, Page: 1}

	if ok, err := s.SetHidden(ctx, share, true); err != nil || !ok {
		t.Fatalf("hide = %v, %v", ok, err)
	}
	first := hiddenAt(t, conn, share)
	if first == nil {
		t.Fatal("hidden_at not set")
	}
	if got := galleryIDs(t, s, query); len(got) != 0 {
		t.Errorf("gallery = %v, want none", got)
	}
	if data, err := s.SharedPack(ctx, share); err != nil || data != nil {
		t.Errorf("SharedPack = %s, %v; want nil", data, err)
	}
	time.Sleep(10 * time.Millisecond)
	if ok, err := s.SetHidden(ctx, share, true); err != nil || !ok {
		t.Fatalf("hide again = %v, %v", ok, err)
	}
	if again := hiddenAt(t, conn, share); again == nil || !again.Equal(*first) {
		t.Errorf("hidden_at = %v, want %v", again, first)
	}
	if ok, err := s.SetHidden(ctx, share, false); err != nil || !ok {
		t.Fatalf("unhide = %v, %v", ok, err)
	}
	if hiddenAt(t, conn, share) != nil {
		t.Error("hidden_at not cleared")
	}
	if got := galleryIDs(t, s, query); !slices.Equal(got, []string{share}) {
		t.Errorf("gallery = %v", got)
	}
	if data, err := s.SharedPack(ctx, share); err != nil || data == nil {
		t.Errorf("SharedPack = %s, %v", data, err)
	}
	for _, missing := range []string{workspace.NewID(), "x"} {
		if ok, err := s.SetHidden(ctx, missing, true); err != nil || ok {
			t.Errorf("SetHidden(%q) = %v, %v; want false, nil", missing, ok, err)
		}
	}
}

func TestSetHiddenKeepsListing(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	category := "掲載維持" + id
	share := insertShare(t, conn, id, 1, galleryRow{pack: map[string]any{"name": "a", "category": category}, listed: listedIn(-time.Hour)})
	before := listedAt(t, conn, share)
	for _, hide := range []bool{true, false} {
		if ok, err := s.SetHidden(ctx, share, hide); err != nil || !ok {
			t.Fatalf("SetHidden(%v) = %v, %v", hide, ok, err)
		}
		if at := listedAt(t, conn, share); at == nil || !at.Equal(*before) {
			t.Fatalf("listed_at = %v, want %v", at, before)
		}
	}
	if got := galleryIDs(t, s, GalleryQuery{Category: category, Sort: GalleryNew, Page: 1}); !slices.Equal(got, []string{share}) {
		t.Errorf("gallery = %v", got)
	}
}
