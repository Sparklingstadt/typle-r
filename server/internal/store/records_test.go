package store

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// legacyLists are lists saved before typle_records: records in the lists, one without an id and two of the same id.
const legacyLists = `[{"id":"l1","name":"a","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[` +
	`{"id":"r1","time":1,"date":"2026-10-10T00:00:00.000Z","keys":[1]},{"time":3,"date":"2024/09/22 10:05"},` +
	`{"id":"r2","time":2,"date":"2026-10-12T00:00:00.000Z"},{"id":"r2","time":4,"date":"2026-10-11T00:00:00.000Z"}]},` +
	`{"id":"l2","name":"b","createdAt":"x","words":[{"display":"b","input":"b","annotation":""}],"records":[` +
	`{"id":"r1","time":5,"date":"2026-10-13T00:00:00.000Z"}]}]`

func insertLegacy(t *testing.T, conn *pgx.Conn, id, lists string) {
	t.Helper()
	if _, err := conn.Exec(context.Background(), `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2, '[]')`,
		id, lists); err != nil {
		t.Fatal(err)
	}
}

// tableRows are the owner's rows of typle_records as list/record ids in order, with whether the row is split.
func tableRows(t *testing.T, conn *pgx.Conn, id string) (keys []string, split bool) {
	t.Helper()
	ctx := context.Background()
	if err := conn.QueryRow(ctx, `SELECT records_split FROM typle_workspaces WHERE owner_id = $1`, id).Scan(&split); err != nil {
		t.Fatal(err)
	}
	rows, err := conn.Query(ctx, `SELECT list_id || '/' || record_id FROM typle_records WHERE owner_id = $1 ORDER BY list_id, position`, id)
	if err != nil {
		t.Fatal(err)
	}
	keys, err = pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	return keys, split
}

func recordIDs(t *testing.T, w *workspace.Workspace, listID string) []string {
	t.Helper()
	list := w.Find(listID)
	if list == nil {
		t.Fatalf("no list %s", listID)
	}
	ids := []string{}
	for _, record := range list.Records {
		if record.ID == nil {
			ids = append(ids, "")
		} else {
			ids = append(ids, *record.ID)
		}
	}
	return ids
}

// The first change moves the records to the table, giving ids where they were missing or repeated within a list, and
// the workspace reads as it did before apart from those ids.
func TestRecordsMoveOnFirstWrite(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	insertLegacy(t, conn, id, legacyLists)
	s := open(t, connection, true)
	before, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if keys, split := tableRows(t, conn, id); len(keys) != 0 || split {
		t.Fatalf("rows before = %v, %v", keys, split)
	}
	if _, err := s.Modify(ctx, id, createList("c")); err != nil {
		t.Fatal(err)
	}
	stored, revision, _ := row(t, conn, id)
	if strings.Contains(stored, `"time"`) || revision != 2 {
		t.Fatalf("lists = %s, revision = %d", stored, revision)
	}
	legacy := legacyID("l1", 1, workspace.Record{Date: "2024/09/22 10:05", Time: 3})
	repeated := legacyID("l1", 3, workspace.Record{Date: "2026-10-11T00:00:00.000Z", Time: 4})
	keys, split := tableRows(t, conn, id)
	want := []string{"l1/r1", "l1/" + legacy, "l1/r2", "l1/" + repeated, "l2/r1"}
	if strings.Join(keys, " ") != strings.Join(want, " ") || !split {
		t.Fatalf("rows = %v, %v; want %v", keys, split, want)
	}
	after, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(recordIDs(t, after, "l1"), " "); got != "r1 "+legacy+" r2 "+repeated {
		t.Fatalf("l1 records = %s", got)
	}
	for i, record := range after.Find("l1").Records {
		old := before.Find("l1").Records[i]
		if record.Time != old.Time || record.Date != old.Date || record.Extra != old.Extra {
			t.Fatalf("record %d = %+v, was %+v", i, record, old)
		}
	}
	sameJSON(t, listRecords(t, s, id, "l2"), `[{"id":"r1","time":5,"date":"2026-10-13T00:00:00.000Z"}]`)
}

// Adding a record to a workspace whose records moved writes that one row, and leaves the others as they were.
func TestAddRecordWritesOneRow(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	insertLegacy(t, conn, id, legacyLists)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, createList("c")); err != nil {
		t.Fatal(err)
	}
	versions := func() string {
		var text string
		if err := conn.QueryRow(ctx, `SELECT string_agg(record_id || ':' || xmin::text, ',' ORDER BY list_id, position)
			FROM typle_records WHERE owner_id = $1 AND list_id = 'l1'`, id).Scan(&text); err != nil {
			t.Fatal(err)
		}
		return text
	}
	old := versions()
	date, runID := "2026-10-20T00:00:00.000Z", "run-9"
	input := workspace.RecordInput{ID: &runID, Time: ptr(1.5), Date: &date, Mistakes: ptr(0.0), Accuracy: ptr(100.0)}
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, added, err := workspace.AddRecord(w, "l1", input, "unused")
		return added, err
	}); err != nil {
		t.Fatal(err)
	}
	if now := versions(); !strings.HasPrefix(now, old+",run-9:") {
		t.Fatalf("rows = %s; were %s", now, old)
	}
}

func ptr[T any](value T) *T { return &value }

// A save of the lists makes the rows theirs: records removed, moved within a list or in a list deleted are deleted or
// moved, and a save of devices alone leaves the records where they are.
func TestWriteRevisionRecords(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	insertLegacy(t, conn, id, legacyLists)
	s := open(t, connection, true)
	if _, err := s.WriteRevision(ctx, id, 1, Change{HasDevices: true}); err != nil {
		t.Fatal(err)
	}
	if keys, split := tableRows(t, conn, id); len(keys) != 0 || split {
		t.Fatalf("rows after devices = %v, %v", keys, split)
	}
	saved, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	w, err := workspace.Decode(saved.Lists, saved.Devices, saved.Packs)
	if err != nil {
		t.Fatal(err)
	}
	// Remove l2, and put l1's last record first.
	l1 := *w.Find("l1")
	l1.Records = append([]workspace.Record{l1.Records[3]}, l1.Records[:2]...)
	written, err := s.WriteRevision(ctx, id, saved.Revision, Change{Lists: []workspace.List{l1}, Packs: w.Packs[:1], HasLists: true, HasPacks: true})
	if err != nil {
		t.Fatal(err)
	}
	legacy := legacyID("l1", 2, workspace.Record{Date: "2024/09/22 10:05", Time: 3})
	keys, split := tableRows(t, conn, id)
	if strings.Join(keys, " ") != "l1/r2 l1/r1 l1/"+legacy || !split {
		t.Fatalf("rows = %v, %v", keys, split)
	}
	// The second r2 is first in its list now, so it keeps its id; the answer has the records as saved.
	var lists []struct{ Records []struct{ ID string } }
	if err := json.Unmarshal(written.Lists, &lists); err != nil || len(lists) != 1 || len(lists[0].Records) != 3 || lists[0].Records[2].ID != legacy {
		t.Fatalf("answer = %s, %v", written.Lists, err)
	}
	// A save from another screen that did not know them is refused, and the records stay.
	if _, err := s.WriteRevision(ctx, id, saved.Revision, Change{Lists: []workspace.List{}, HasLists: true}); err != ErrConflict {
		t.Fatalf("stale save: %v", err)
	}
	if keys, _ := tableRows(t, conn, id); len(keys) != 3 {
		t.Fatalf("rows after the stale save = %v", keys)
	}
}

// Records an app from before the table saved in the lists of a workspace whose records moved are read with the table's,
// and moved by the next write.
func TestRecordsLeftInLists(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	insertLegacy(t, conn, id, legacyLists)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, createList("c")); err != nil {
		t.Fatal(err)
	}
	// As the previous version of the app saves: l2 with its record r1 (the table's) and a new one.
	if _, err := conn.Exec(ctx, `UPDATE typle_workspaces SET lists = jsonb_set(lists, '{1,records}',
		'[{"id":"r1","time":5,"date":"2026-10-13T00:00:00.000Z"},{"id":"new","time":6,"date":"2026-10-14T00:00:00.000Z"}]')
		WHERE owner_id = $1`, id); err != nil {
		t.Fatal(err)
	}
	read, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(recordIDs(t, read, "l2"), " "); got != "new r1" {
		t.Fatalf("l2 records = %s", got)
	}
	if _, err := s.Modify(ctx, id, createList("d")); err != nil {
		t.Fatal(err)
	}
	keys, _ := tableRows(t, conn, id)
	if !strings.Contains(strings.Join(keys, " "), "l2/new l2/r1") {
		t.Fatalf("rows = %v", keys)
	}
	if stored, _, _ := row(t, conn, id); strings.Contains(stored, `"time"`) {
		t.Fatalf("lists = %s", stored)
	}
}

// A page of a list's records comes from the table when the table can answer for the list alone, and otherwise the
// caller is told to read the workspace.
func TestRecordPage(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	insertLegacy(t, conn, id, legacyLists)
	s := open(t, connection, true)
	if _, ok, err := s.Records(ctx, id, "l1", nil, 10); ok || err != nil {
		t.Fatalf("before the move: %v, %v", ok, err)
	}
	if _, err := s.Modify(ctx, id, createList("c")); err != nil {
		t.Fatal(err)
	}
	page, ok, err := s.Records(ctx, id, "l1", nil, 3)
	if !ok || err != nil {
		t.Fatalf("page: %v, %v", ok, err)
	}
	ids := []string{}
	for _, record := range page {
		ids = append(ids, *record.ID)
	}
	repeated := legacyID("l1", 3, workspace.Record{Date: "2026-10-11T00:00:00.000Z", Time: 4})
	if strings.Join(ids, " ") != "r2 "+repeated+" r1" {
		t.Fatalf("page = %v", ids)
	}
	// The same records, in the same order and shape, as the workspace gives (api.records sorts them so).
	full, _, _ := s.Records(ctx, id, "l1", nil, 100)
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	sorted := slices.Clone(w.Find("l1").Records)
	slices.SortStableFunc(sorted, func(a, b workspace.Record) int { return b.At.Compare(a.At) })
	gotJSON, _ := json.Marshal(full)
	wantJSON, _ := json.Marshal(sorted)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("page = %s; workspace = %s", gotJSON, wantJSON)
	}
	since := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	if page, ok, _ := s.Records(ctx, id, "l1", &since, 10); !ok || len(page) != 1 || *page[0].ID != "r2" {
		t.Fatalf("since: %+v, %v", page, ok)
	}
	if page, ok, _ := s.Records(ctx, id, "c-missing", nil, 10); ok || page != nil {
		t.Fatalf("missing list: %+v, %v", page, ok)
	}
	// A list that still holds records of its own is read with the workspace.
	if _, err := conn.Exec(ctx, `UPDATE typle_workspaces SET lists = jsonb_set(lists, '{0,records}',
		'[{"id":"own","time":1,"date":"2026-10-01T00:00:00.000Z"}]') WHERE owner_id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := s.Records(ctx, id, "l1", nil, 10); ok {
		t.Fatal("a list with records of its own was answered from the table")
	}
}

// The rollback script puts the records back in their lists for the app from before the table, which then reads the
// same records, and a workspace whose records never moved is left as it was.
func TestRecordsRollback(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	moved, kept := owner(t, conn), owner(t, conn)
	insertLegacy(t, conn, moved, legacyLists)
	insertLegacy(t, conn, kept, legacyLists)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, moved, createList("c")); err != nil {
		t.Fatal(err)
	}
	before, err := s.ReadRevision(ctx, moved)
	if err != nil {
		t.Fatal(err)
	}
	keptBefore, _, _ := row(t, conn, kept)
	// The script changes every split workspace and empties typle_records, so it would change the rows of the tests
	// running in other packages against the same database too; it is run inside a transaction rolled back at the end.
	uncommitted(t, conn, rollbackScript(t))
	if keys, split := tableRows(t, conn, moved); len(keys) != 0 || split {
		t.Fatalf("rows after rollback = %v, %v", keys, split)
	}
	stored, revision, _ := row(t, conn, moved)
	if revision != before.Revision+1 {
		t.Fatalf("revision = %d", revision)
	}
	// What the app before the table reads: the lists column alone.
	sameLists(t, json.RawMessage(stored), before.Lists)
	if keptAfter, _, _ := row(t, conn, kept); keptAfter != keptBefore {
		t.Fatalf("unmoved lists = %s, were %s", keptAfter, keptBefore)
	}
}

// The rollback script run while a save holds its row (lock, then UPDATE, as Modify does) waits for the save instead of
// the two waiting for each other (deadlock), and both finish.
func TestRecordsRollbackDuringSave(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.WriteRevision(ctx, id, 0, Change{HasDevices: true}); err != nil {
		t.Fatal(err)
	}
	save, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer save.Rollback(ctx)
	if _, err := save.Exec(ctx, `SELECT 1 FROM typle_workspaces WHERE owner_id = $1 FOR UPDATE`, id); err != nil {
		t.Fatal(err)
	}
	_, scriptConn := database(t)
	script := rollbackScript(t)
	if _, err := scriptConn.Exec(ctx, "BEGIN"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = scriptConn.Exec(ctx, "ROLLBACK") })
	done := make(chan error, 1)
	go func() {
		_, err := scriptConn.Exec(ctx, script)
		done <- err
	}()
	deadline := time.Now().Add(10 * time.Second)
	for {
		var waiting bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock')`,
			scriptConn.PgConn().PID()).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the script did not wait for the save")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, err := save.Exec(ctx, `UPDATE typle_workspaces SET revision = revision + 1 WHERE owner_id = $1`, id); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := save.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatalf("script: %v", err)
	}
}

// rollbackScript is scripts/records-rollback.sql without its BEGIN and COMMIT, to run with uncommitted.
func rollbackScript(t *testing.T) string {
	t.Helper()
	script, err := os.ReadFile(filepath.Join("..", "..", "..", "scripts", "records-rollback.sql"))
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSuffix(strings.Replace(strings.TrimSpace(string(script)), "\nBEGIN;\n", "\n", 1), "\nCOMMIT;")
}

func sameLists(t *testing.T, got, want json.RawMessage) {
	t.Helper()
	var g, w any
	_ = json.Unmarshal(got, &g)
	_ = json.Unmarshal(want, &w)
	gotText, _ := json.Marshal(g)
	wantText, _ := json.Marshal(w)
	if string(gotText) != string(wantText) {
		t.Fatalf("lists = %s, want %s", gotText, wantText)
	}
}

// Rows left by a workspace row deleted without them are not shown in a new workspace of the same owner, whether the
// app (WriteRevision) or a change (Modify) creates it.
func TestRecordsOfDeletedWorkspace(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	for name, create := range map[string]func(id string) error{
		"save":   func(id string) error { _, err := s.WriteRevision(ctx, id, 0, Change{HasDevices: true}); return err },
		"change": func(id string) error { _, err := s.Modify(ctx, id, createList("c")); return err },
	} {
		t.Run(name, func(t *testing.T) {
			id := owner(t, conn)
			insertLegacy(t, conn, id, legacyLists)
			if _, err := s.Modify(ctx, id, createList("c")); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.Exec(ctx, `DELETE FROM typle_workspaces WHERE owner_id = $1`, id); err != nil {
				t.Fatal(err)
			}
			if err := create(id); err != nil {
				t.Fatal(err)
			}
			if keys, split := tableRows(t, conn, id); len(keys) != 0 || !split {
				t.Fatalf("rows = %v, %v", keys, split)
			}
		})
	}
}

// Migration 0032_drop_legacy deletes the workspaces saved in a shape from before v1.0.0, with their records and shared
// links, and keeps those saved since.
func TestDropLegacyMigration(t *testing.T) {
	ctx := context.Background()
	_, conn := database(t)
	list := func(fields string) string {
		return `{"id":"l","name":"l","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[]` + fields + `}`
	}
	current := `[` + list(`,"packId":"p"`) + `]`
	pack := `[{"id":"p","name":"P","createdAt":"x"}]`
	rows := map[string]struct {
		lists, packs string
		dropped      bool
	}{
		"current":       {current, pack, false},
		"empty":         {`[]`, `[]`, false},
		"no packs":      {current, ``, true},
		"no pack id":    {`[` + list(``) + `]`, pack, true},
		"group":         {`[` + list(`,"packId":"p","group":"G"`) + `]`, pack, true},
		"category":      {`[` + list(`,"packId":"p","category":"C"`) + `]`, pack, true},
		"tags":          {`[` + list(`,"packId":"p","tags":["t"]`) + `]`, pack, true},
		"list a string": {`["l"]`, pack, true},
	}
	owners := map[string]string{}
	for name, row := range rows {
		id := owner(t, conn)
		owners[name] = id
		var packs any
		if row.packs != "" {
			packs = row.packs
		}
		if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, packs, devices) VALUES ($1, $2, $3, '[]')`,
			id, row.lists, packs); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO typle_records (owner_id, list_id, record_id, position, at, data)
			VALUES ($1, 'l', 'r', 0, now(), '{}')`, id); err != nil {
			t.Fatal(err)
		}
		if _, err := conn.Exec(ctx, `INSERT INTO typle_shared_packs (id, owner_id, pack_id, data) VALUES (gen_random_uuid(), $1, 'p', '{}')`,
			id); err != nil {
			t.Fatal(err)
		}
	}
	script, err := os.ReadFile(filepath.Join("..", "..", "..", "prisma", "migrations", "0032_drop_legacy", "migration.sql"))
	if err != nil {
		t.Fatal(err)
	}
	// The script deletes any workspace in the old shape, so it is run inside a transaction rolled back at the end.
	uncommitted(t, conn, string(script))
	for name, row := range rows {
		var workspaces, records, shares int
		if err := conn.QueryRow(ctx, `SELECT (SELECT count(*) FROM typle_workspaces WHERE owner_id = $1),
			(SELECT count(*) FROM typle_records WHERE owner_id = $1), (SELECT count(*) FROM typle_shared_packs WHERE owner_id = $1)`,
			owners[name]).Scan(&workspaces, &records, &shares); err != nil {
			t.Fatal(err)
		}
		left := 1
		if row.dropped {
			left = 0
		}
		if workspaces != left || records != left || shares != left {
			t.Errorf("%s: workspaces %d, records %d, shares %d; want %d each", name, workspaces, records, shares, left)
		}
	}
}

// A followed pack's lists are saved without their words, by a change (Modify) and by the app's save (WriteRevision),
// and read back with them from the catalog; the list of the account's own pack keeps its words.
func TestFollowedWordsNotSaved(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	official, err := workspace.OfficialPacks()
	if err != nil {
		t.Fatal(err)
	}
	first := official[0]
	packs := `[{"id":"f","name":"公式","origin":{"catalogId":"` + first.CatalogID + `","version":1,"followed":true},"createdAt":"x"},` +
		`{"id":"q","name":"Mine","createdAt":"x"}]`
	lists := `[{"id":"fl","name":"x","packId":"f","origin":{"listId":"` + first.Lists[0].ID + `"},"createdAt":"x",` +
		`"words":[{"display":"a","input":"a","annotation":""}],"records":[]},` +
		`{"id":"g","name":"G","packId":"q","createdAt":"x","words":[{"display":"g","input":"g","annotation":""}],"records":[]}]`
	s := open(t, connection, true)
	check := func(id string) {
		t.Helper()
		var stored []struct {
			PackID string
			Words  []json.RawMessage
		}
		raw, _, _ := row(t, conn, id)
		if err := json.Unmarshal([]byte(raw), &stored); err != nil {
			t.Fatal(err)
		}
		for _, list := range stored {
			if (list.PackID == "f") == (len(list.Words) > 0) {
				t.Fatalf("stored lists = %s", raw)
			}
		}
		w, err := s.Read(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		for _, list := range w.Lists {
			if list.PackID == "f" && len(list.Words) == 0 {
				t.Fatalf("read without words: %+v", list)
			}
		}
		if len(w.Find("fl").Words) != len(first.Lists[0].Words) {
			t.Fatalf("fl words = %d, catalog %d", len(w.Find("fl").Words), len(first.Lists[0].Words))
		}
	}
	changed := owner(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, packs, devices) VALUES ($1, $2, $3, '[]')`,
		changed, lists, packs); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Modify(ctx, changed, createList("c")); err != nil {
		t.Fatal(err)
	}
	check(changed)
	saved := owner(t, conn)
	w, err := workspace.Decode([]byte(lists), []byte(`[]`), []byte(packs))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.WriteRevision(ctx, saved, 0, Change{Lists: w.Lists, Packs: w.Packs, HasLists: true, HasPacks: true}); err != nil {
		t.Fatal(err)
	}
	check(saved)
}

// uncommitted runs script on conn in a transaction that is rolled back when the test ends: the script's changes are
// read on conn alone and never reach the other tests, which share the database (go test runs packages in parallel).
// script must not end the transaction itself.
func uncommitted(t *testing.T, conn *pgx.Conn, script string) {
	t.Helper()
	if strings.Contains(script, "BEGIN;") || strings.Contains(script, "COMMIT;") {
		t.Fatalf("script ends the transaction itself:\n%s", script)
	}
	ctx := context.Background()
	if _, err := conn.Exec(ctx, "BEGIN"); err != nil {
		t.Fatal(err)
	}
	// Registered after database's Close, so it runs first.
	t.Cleanup(func() { _, _ = conn.Exec(ctx, "ROLLBACK") })
	if _, err := conn.Exec(ctx, script); err != nil {
		t.Fatal(err)
	}
}
