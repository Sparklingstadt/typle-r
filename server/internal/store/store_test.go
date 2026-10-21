package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

func TestConnString(t *testing.T) {
	cases := map[string]string{
		"postgres://u:p@h/db":                                                   "postgres://u:p@h/db",
		"postgresql://u:p@h/db?sslmode=require":                                 "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=prefer":                                  "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=verify-ca":                               "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=disable":                                 "postgresql://u:p@h/db?sslmode=disable",
		"postgresql://u:p@h/db?sslmode=verify-full":                             "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?channel_binding=require&sslmode=require":         "postgresql://u:p@h/db?channel_binding=require&sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=require&uselibpqcompat=true":             "postgresql://u:p@h/db?sslmode=require",
		"postgresql://user:p%40ss@h/db?sslmode=require&channel_binding=require": "postgresql://user:p%40ss@h/db?channel_binding=require&sslmode=verify-full",
	}
	for input, want := range cases {
		if got, err := ConnString(input); err != nil || got != want {
			t.Errorf("ConnString(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	for _, input := range []string{"", "mysql://h/db", "://"} {
		if _, err := ConnString(input); err == nil {
			t.Errorf("ConnString(%q) succeeded", input)
		}
	}
}

// The database tests need the app's tables (npm run db:migrate). They add rows under random owners and delete them.
func database(t *testing.T) (string, *pgx.Conn) {
	t.Helper()
	connection := os.Getenv("TYPLE_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("set TYPLE_TEST_DATABASE_URL to a migrated test database")
	}
	conn, err := pgx.Connect(context.Background(), connection)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(context.Background()) })
	return connection, conn
}

func owner(t *testing.T, conn *pgx.Conn) string {
	t.Helper()
	random := make([]byte, 8)
	_, _ = rand.Read(random)
	id := "go-test:" + hex.EncodeToString(random)
	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), `DELETE FROM typle_workspaces WHERE owner_id = $1`, id)
	})
	return id
}

func TestReadSavedWorkspace(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id, other := owner(t, conn), owner(t, conn)
	lists := `[{"id":"l1","name":"英単語","createdAt":"2026-10-10T01:23:45.000Z","shared":true,"shareId":"x",` +
		`"words":[{"display":"apple","input":"apple","annotation":""}],"records":[{"time":1.5,"date":"2026-10-10T02:00:00.000Z"}]}]`
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2, $3), ($4, '[]', '[]')`,
		id, lists, `[{"id":"d1","name":"自宅","layout":"JIS"}]`, other); err != nil {
		t.Fatal(err)
	}
	s, err := Open(ctx, connection, false)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Lists) != 1 || w.Lists[0].Name != "英単語" || w.Lists[0].Records[0].Time != 1.5 || w.Devices[0].Name != "自宅" {
		t.Fatalf("workspace = %+v", w)
	}

	// Each account reads only its own row.
	if w, err := s.Read(ctx, other); err != nil || len(w.Lists) != 0 {
		t.Fatalf("other = %+v, %v", w, err)
	}
}

func TestReadWithoutRowGivesInitialLists(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s, err := Open(ctx, connection, false)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	w, err := s.Read(ctx, owner(t, conn))
	if err != nil || len(w.Lists) != 3 || w.Lists[0].ID != "sample-1" {
		t.Fatalf("workspace = %+v, %v", w, err)
	}
}

func TestReadRefusesDataTheAppRefuses(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, '[{"id":"l"}]', '[]')`, id); err != nil {
		t.Fatal(err)
	}
	s, err := Open(ctx, connection, false)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.Read(ctx, id); err == nil {
		t.Fatal("read an invalid workspace")
	}
}

func TestConnectionIsReadOnly(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s, err := Open(ctx, connection, false)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.pool.Exec(ctx, `INSERT INTO typle_workspaces (owner_id) VALUES ($1)`, id); err == nil {
		t.Fatal("wrote through the read-only connection")
	}
}

func TestOpenAppPing(t *testing.T) {
	ctx := context.Background()
	connection, _ := database(t)
	s, err := OpenApp(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	if config := s.pool.Config(); config.MaxConns != 5 || config.MaxConnIdleTime != 30*time.Second {
		t.Fatalf("pool = %d connections, idle %v", config.MaxConns, config.MaxConnIdleTime)
	}
}

func open(t *testing.T, connection string, writable bool) *Store {
	t.Helper()
	s, err := Open(context.Background(), connection, writable)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}

func row(t *testing.T, conn *pgx.Conn, id string) (lists string, revision int, updated time.Time) {
	t.Helper()
	if err := conn.QueryRow(context.Background(), `SELECT lists::text, revision, updated_at FROM typle_workspaces WHERE owner_id = $1`, id).
		Scan(&lists, &revision, &updated); err != nil {
		t.Fatal(err)
	}
	return lists, revision, updated
}

func deleteList(id string) func(*workspace.Workspace) (bool, error) {
	return func(w *workspace.Workspace) (bool, error) { return true, workspace.DeleteList(w, id) }
}

func createList(name string) func(*workspace.Workspace) (bool, error) {
	return func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.CreateList(w, workspace.ListInput{Name: &name, Words: []workspace.Word{{Display: "a", Input: "a"}}},
			workspace.NewID(), time.Now())
		return true, err
	}
}

func TestModifyCreatesRow(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	w, err := s.Modify(ctx, id, deleteList("sample-1"))
	if err != nil {
		t.Fatal(err)
	}
	read, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	for _, got := range []*workspace.Workspace{w, read} {
		if len(got.Lists) != 2 || got.Lists[0].ID != "sample-2" || got.Find("sample-1") != nil {
			t.Fatalf("lists = %+v", got.Lists)
		}
	}
	// Inserting the initial lists made revision 1; the change made 2.
	if _, revision, _ := row(t, conn, id); revision != 2 {
		t.Fatalf("revision = %d", revision)
	}
}

func TestModifyIncrementsRevision(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices, updated_at) VALUES ($1, '[]', '[]', now() - interval '1 day')`, id); err != nil {
		t.Fatal(err)
	}
	_, _, before := row(t, conn, id)
	s := open(t, connection, true)
	for _, name := range []string{"a", "b"} {
		if _, err := s.Modify(ctx, id, createList(name)); err != nil {
			t.Fatal(err)
		}
	}
	lists, revision, updated := row(t, conn, id)
	if revision != 3 || !updated.After(before) || !strings.Contains(lists, `"name": "b"`) {
		t.Fatalf("lists = %s, revision = %d, updated = %v", lists, revision, updated)
	}
}

func TestModifyUnchanged(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, createList("a")); err != nil {
		t.Fatal(err)
	}
	lists, revision, _ := row(t, conn, id)
	if _, err := s.Modify(ctx, id, func(*workspace.Workspace) (bool, error) { return false, nil }); err != nil {
		t.Fatal(err)
	}
	if again, after, _ := row(t, conn, id); again != lists || after != revision {
		t.Fatalf("revision %d → %d", revision, after)
	}
}

func TestModifyError(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, createList("a")); err != nil {
		t.Fatal(err)
	}
	lists, revision, _ := row(t, conn, id)
	_, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		w.Lists = nil
		return true, &workspace.Error{Key: "listNameDuplicate"}
	})
	var e *workspace.Error
	if !errors.As(err, &e) || e.Key != "listNameDuplicate" {
		t.Fatalf("err = %v", err)
	}
	if again, after, _ := row(t, conn, id); again != lists || after != revision {
		t.Fatal("the row changed")
	}
}

func TestModifyTooLarge(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, createList("a")); err != nil {
		t.Fatal(err)
	}
	lists, revision, _ := row(t, conn, id)
	big := strings.Repeat("a", workspace.MaxWordText)
	words := make([]workspace.Word, workspace.MaxWords)
	for i := range words {
		words[i] = workspace.Word{Display: big, Input: "a"}
	}
	_, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		name := "big"
		_, err := workspace.CreateList(w, workspace.ListInput{Name: &name, Words: words}, "big", time.Now())
		return true, err
	})
	var e *workspace.Error
	if !errors.As(err, &e) || e.Key != "workspaceTooLarge" {
		t.Fatalf("err = %v", err)
	}
	if again, after, _ := row(t, conn, id); again != lists || after != revision {
		t.Fatal("the row changed")
	}
}

func TestModifyConcurrent(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	errs := make(chan error, 10)
	for i := range 10 {
		go func() {
			_, err := s.Modify(ctx, id, createList(fmt.Sprintf("list %d", i)))
			errs <- err
		}()
	}
	for range 10 {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	// The three initial lists and all ten.
	if len(w.Lists) != 13 {
		t.Fatalf("lists = %d", len(w.Lists))
	}
}

func TestReadOnlyRefusesWrites(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, false)
	_, err := s.Modify(ctx, id, createList("a"))
	var e *workspace.Error
	if err == nil || errors.As(err, &e) {
		t.Fatalf("err = %v", err)
	}
	var count int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM typle_workspaces WHERE owner_id = $1`, id).Scan(&count); err != nil || count != 0 {
		t.Fatalf("count = %d, %v", count, err)
	}
}

// Whatever a change does, lists that would not be read back are never saved: the account would no longer load.
func TestModifyRefusesUnreadableLists(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, createList("a")); err != nil {
		t.Fatal(err)
	}
	lists, revision, _ := row(t, conn, id)
	_, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		w.Lists[0].Records = append(w.Lists[0].Records, workspace.Record{Time: 1, Date: "10000-01-01T00:00:00.000Z"})
		return true, nil
	})
	var e *workspace.Error
	if err == nil || errors.As(err, &e) {
		t.Fatalf("err = %v", err)
	}
	if again, after, _ := row(t, conn, id); again != lists || after != revision {
		t.Fatal("the row changed")
	}
}

// Devices are saved in their own column, and records keep their copy of a device that is renamed or deleted.
func TestModifyWritesDevices(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	lists := `[{"id":"l1","name":"a","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],` +
		`"records":[{"time":1,"date":"2026-10-10T00:00:00.000Z","device":{"id":"d1","name":"自宅","layout":"JIS"}}]}]`
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2, $3)`,
		id, lists, `[{"id":"d1","name":"自宅","layout":"JIS"}]`); err != nil {
		t.Fatal(err)
	}
	s := open(t, connection, true)
	name := "会社"
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.CreateDevice(w, workspace.DeviceInput{Name: &name}, "d2")
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) { return true, workspace.DeleteDevice(w, "d1") }); err != nil {
		t.Fatal(err)
	}
	var devices string
	if err := conn.QueryRow(ctx, `SELECT devices::text FROM typle_workspaces WHERE owner_id = $1`, id).Scan(&devices); err != nil {
		t.Fatal(err)
	}
	if devices != `[{"id": "d2", "name": "会社", "layout": ""}]` {
		t.Fatalf("devices = %s", devices)
	}
	w, err := s.Read(ctx, id)
	if err != nil || len(w.Devices) != 1 || w.Lists[0].Records[0].Device.Name != "自宅" {
		t.Fatalf("workspace = %+v, %v", w, err)
	}
	if _, revision, _ := row(t, conn, id); revision != 3 {
		t.Fatalf("revision = %d", revision)
	}
}

// Changing and deleting records keeps the other records, and the fields Typle does not know, as they were saved.
func TestModifyRecords(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	lists := `[{"id":"l1","name":"a","createdAt":"x","words":[{"display":"a","input":"a","annotation":""}],"records":[` +
		`{"id":"r1","time":1,"date":"2026-10-10T00:00:00.000Z","keys":[1]},{"id":"r2","time":2,"date":"2026-10-11T00:00:00.000Z"},` +
		`{"time":3,"date":"2024/09/22 10:05"}]}]`
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2, '[]')`, id, lists); err != nil {
		t.Fatal(err)
	}
	s := open(t, connection, true)
	accuracy := 99.5
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.UpdateRecord(w, "l1", "r1", workspace.RecordChange{Accuracy: &accuracy})
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) { return true, workspace.DeleteRecord(w, "l1", "r2") }); err != nil {
		t.Fatal(err)
	}
	stored, revision, _ := row(t, conn, id)
	want := `"records": [{"id": "r1", "date": "2026-10-10T00:00:00.000Z", "keys": [1], "time": 1, "accuracy": 99.5}, {"date": "2024/09/22 10:05", "time": 3}]`
	if !strings.Contains(stored, want) || revision != 3 {
		t.Fatalf("lists = %s, revision = %d", stored, revision)
	}
}

// A copy is saved with the words of its source and no records; the source stays as it was.
func TestModifyCopiesList(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	lists := `[{"id":"l1","name":"英単語","createdAt":"x","color":"red","words":[{"display":"a","input":"a","annotation":"","reading":"エー"}],` +
		`"records":[{"id":"r1","time":1,"date":"2026-10-10T00:00:00.000Z"}]}]`
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2, '[]')`, id, lists); err != nil {
		t.Fatal(err)
	}
	s := open(t, connection, true)
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.CopyList(w, "l1", nil, "c1", time.Date(2026, 10, 21, 0, 0, 0, 0, time.UTC))
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := row(t, conn, id)
	want := `{"id": "c1", "name": "英単語（コピー）", "words": [{"input": "a", "display": "a", "reading": "エー", "annotation": ""}], "records": [], "createdAt": "2026-10-21T00:00:00.000Z"}`
	if !strings.Contains(stored, want) || !strings.Contains(stored, `"color": "red"`) || !strings.Contains(stored, `"records": [{"id": "r1"`) {
		t.Fatalf("lists = %s", stored)
	}
}

func TestModifyImportsList(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	words, err := workspace.ParseWordFile("input,display,anotation\nneko,\"猫,ねこ\",\"1行目\n2行目\"\n", ',')
	if err != nil {
		t.Fatal(err)
	}
	name := "動物"
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.CreateList(w, workspace.ListInput{Name: &name, Words: words}, "i1", time.Date(2026, 10, 21, 0, 0, 0, 0, time.UTC))
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	stored, _, _ := row(t, conn, id)
	// A new account starts with the sample lists; the imported one is added after them.
	want := `{"id": "i1", "name": "動物", "words": [{"input": "neko", "display": "猫,ねこ", "annotation": "1行目\n2行目"}], "records": [], "createdAt": "2026-10-21T00:00:00.000Z"}]`
	if !strings.HasSuffix(stored, want) {
		t.Fatalf("lists = %.300s…", stored[max(0, len(stored)-300):])
	}
}

func newLists(n int) []workspace.List {
	lists := make([]workspace.List, n)
	for i := range lists {
		lists[i] = workspace.List{ID: fmt.Sprintf("l%d", i), Name: fmt.Sprintf("list %d", i), CreatedAt: "2026-10-10T01:23:45.000Z",
			Words: []workspace.Word{{Display: "a", Input: "a"}}, Records: []workspace.Record{}}
	}
	return lists
}

func insertLists(t *testing.T, conn *pgx.Conn, id string, n int) {
	t.Helper()
	encoded, err := workspace.Encode(newLists(n))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(context.Background(), `INSERT INTO typle_workspaces (owner_id, lists) VALUES ($1, $2)`, id, string(encoded)); err != nil {
		t.Fatal(err)
	}
}

func isListLimit(err error) bool {
	var e *workspace.Error
	return errors.As(err, &e) && e.Key == "listLimit"
}

func TestReadRevisionMissing(t *testing.T) {
	connection, conn := database(t)
	s := open(t, connection, true)
	saved, err := s.ReadRevision(context.Background(), owner(t, conn))
	if saved != nil || err != nil {
		t.Fatalf("ReadRevision = %v, %v; want nil, nil", saved, err)
	}
}

func TestWriteRevisionCreate(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	devices := []workspace.Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}
	saved, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(2), HasLists: true, Devices: devices, HasDevices: true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision != 1 || len(saved.Workspace.Lists) != 2 || len(saved.Workspace.Devices) != 1 {
		t.Fatalf("saved = %+v", saved)
	}
	read, err := s.ReadRevision(ctx, id)
	if err != nil || read == nil || read.Revision != 1 || len(read.Workspace.Lists) != 2 {
		t.Fatalf("ReadRevision = %+v, %v", read, err)
	}
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true}); !errors.Is(err, ErrConflict) {
		t.Fatalf("second create: %v; want ErrConflict", err)
	}
}

func TestWriteRevisionCreateOmitted(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	saved, err := s.WriteRevision(ctx, id, 0, Change{Devices: []workspace.Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}, HasDevices: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Workspace.Lists) != 0 || len(saved.Workspace.Devices) != 1 {
		t.Fatalf("saved = %+v", saved.Workspace)
	}
}

func TestWriteRevisionUpdate(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true}); err != nil {
		t.Fatal(err)
	}
	saved, err := s.WriteRevision(ctx, id, 1, Change{Lists: newLists(3), HasLists: true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision != 2 || len(saved.Workspace.Lists) != 3 {
		t.Fatalf("saved = %+v", saved)
	}
	if _, err := s.WriteRevision(ctx, id, 1, Change{Lists: newLists(1), HasLists: true}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale revision: %v; want ErrConflict", err)
	}
	if _, err := s.WriteRevision(ctx, owner(t, conn), 1, Change{Lists: newLists(1), HasLists: true}); !errors.Is(err, ErrConflict) {
		t.Fatalf("missing row: %v; want ErrConflict", err)
	}
	if _, revision, _ := row(t, conn, id); revision != 2 {
		t.Fatalf("revision = %d after refused saves", revision)
	}
}

func TestWriteRevisionKeepsOmitted(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(2), HasLists: true}); err != nil {
		t.Fatal(err)
	}
	devices := []workspace.Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}
	saved, err := s.WriteRevision(ctx, id, 1, Change{Devices: devices, HasDevices: true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision != 2 || len(saved.Workspace.Lists) != 2 || len(saved.Workspace.Devices) != 1 {
		t.Fatalf("saved = %+v", saved.Workspace)
	}
	saved, err = s.WriteRevision(ctx, id, 2, Change{Lists: newLists(1), HasLists: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Workspace.Lists) != 1 || len(saved.Workspace.Devices) != 1 {
		t.Fatalf("saved = %+v", saved.Workspace)
	}
}

func TestWriteRevisionListLimit(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	over := workspace.MaxLists + 1

	fresh := owner(t, conn)
	if _, err := s.WriteRevision(ctx, fresh, 0, Change{Lists: newLists(over), HasLists: true}); !isListLimit(err) {
		t.Fatalf("create with %d lists: %v; want listLimit", over, err)
	}
	if saved, _ := s.ReadRevision(ctx, fresh); saved != nil {
		t.Fatal("a refused create left a row")
	}

	// Lists merged from removed profiles may exceed the limit; a save may keep that number or lower it, never raise it.
	id := owner(t, conn)
	insertLists(t, conn, id, over)
	if _, err := s.WriteRevision(ctx, id, 1, Change{Lists: newLists(over + 1), HasLists: true}); !isListLimit(err) {
		t.Fatalf("raising to %d lists: %v; want listLimit", over+1, err)
	}
	if _, err := s.WriteRevision(ctx, id, 1, Change{Lists: newLists(over), HasLists: true}); err != nil {
		t.Fatalf("keeping %d lists: %v", over, err)
	}
	if _, err := s.WriteRevision(ctx, id, 1, Change{Lists: newLists(over + 1), HasLists: true}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale revision with %d lists: %v; want ErrConflict before listLimit", over+1, err)
	}
}

func TestWriteRevisionConcurrent(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true}); err != nil {
		t.Fatal(err)
	}
	// Both writers read revision 1 before either updates: a lock held on the row makes the UPDATEs wait, and the
	// lock is released only once both are waiting. Only the revision in the UPDATE then decides who wins.
	holder, err := pgx.Connect(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer holder.Close(ctx)
	tx, err := holder.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT 1 FROM typle_workspaces WHERE owner_id = $1 FOR UPDATE`, id); err != nil {
		t.Fatal(err)
	}
	errs := make(chan error, 2)
	for i := range 2 {
		go func() {
			_, err := s.WriteRevision(ctx, id, 1, Change{Lists: newLists(i + 2), HasLists: true})
			errs <- err
		}()
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		var waiting int
		if err := conn.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'
			AND query LIKE 'UPDATE typle_workspaces%' AND datname = current_database()`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("%d writers are waiting at the UPDATE, want 2", waiting)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	var conflicts, successes int
	for range 2 {
		switch err := <-errs; {
		case err == nil:
			successes++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes = %d, conflicts = %d; want 1 and 1", successes, conflicts)
	}
	if _, revision, _ := row(t, conn, id); revision != 2 {
		t.Fatalf("revision = %d, want 2", revision)
	}
}

func TestWriteRevisionConcurrentCreate(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	errs := make(chan error, 2)
	for range 2 {
		go func() {
			_, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true})
			errs <- err
		}()
	}
	var conflicts int
	for range 2 {
		if err := <-errs; errors.Is(err, ErrConflict) {
			conflicts++
		} else if err != nil {
			t.Fatal(err)
		}
	}
	if conflicts != 1 {
		t.Fatalf("conflicts = %d, want 1", conflicts)
	}
}

func TestWriteRevisionKeepsUnknownFields(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	lists := newLists(1)
	lists[0].Words[0].Extra = `{"x":{"a":[1,2]}}`
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: lists, HasLists: true}); err != nil {
		t.Fatal(err)
	}
	saved, err := s.ReadRevision(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if got := saved.Workspace.Lists[0].Words[0].Extra; got != `{"x":{"a":[1,2]}}` {
		t.Fatalf("unknown field lost: %q", got)
	}
	stored, _, _ := row(t, conn, id)
	if !strings.Contains(stored, `"x"`) {
		t.Fatalf("stored lists = %s", stored)
	}
}

func TestWriteRevisionRefusesUnreadableLists(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	twice := newLists(2)
	twice[1].ID = twice[0].ID
	unnamed := newLists(1)
	unnamed[0].Name = " "
	for name, lists := range map[string][]workspace.List{"same id": twice, "empty name": unnamed} {
		fresh := owner(t, conn)
		_, err := s.WriteRevision(ctx, fresh, 0, Change{Lists: lists, HasLists: true})
		var e *workspace.Error
		if err == nil || errors.Is(err, ErrConflict) || errors.As(err, &e) {
			t.Fatalf("%s, create: %v; want a plain error", name, err)
		}
		if saved, err := s.ReadRevision(ctx, fresh); saved != nil || err != nil {
			t.Fatalf("%s: a refused create left a row (%v, %v)", name, saved, err)
		}

		id := owner(t, conn)
		if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true}); err != nil {
			t.Fatal(err)
		}
		before, _, _ := row(t, conn, id)
		_, err = s.WriteRevision(ctx, id, 1, Change{Lists: lists, HasLists: true})
		if err == nil || errors.Is(err, ErrConflict) || errors.As(err, &e) {
			t.Fatalf("%s, update: %v; want a plain error", name, err)
		}
		if after, revision, _ := row(t, conn, id); after != before || revision != 1 {
			t.Fatalf("%s: a refused update changed the row (revision %d)", name, revision)
		}
		if _, err := s.ReadRevision(ctx, id); err != nil {
			t.Fatalf("%s: the account no longer loads: %v", name, err)
		}
	}
}

func TestWriteRevisionRefusesUnreadableDevices(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.WriteRevision(ctx, id, 1, Change{Devices: []workspace.Device{{ID: "d1", Name: " ", Layout: "JIS"}}, HasDevices: true}); err == nil {
		t.Fatal("a device without a name was saved")
	}
	if _, revision, _ := row(t, conn, id); revision != 1 {
		t.Fatalf("revision = %d after a refused save", revision)
	}
}

func TestWriteRevisionLimits(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	long := newLists(1)
	long[0].Name = strings.Repeat("a", workspace.MaxListName+1)
	manyWords := newLists(1)
	manyWords[0].Words = make([]workspace.Word, workspace.MaxWords+1)
	for i := range manyWords[0].Words {
		manyWords[0].Words[i] = workspace.Word{Display: "a", Input: "a"}
	}
	for name, lists := range map[string][]workspace.List{"name": long, "words": manyWords} {
		fresh := owner(t, conn)
		_, err := s.WriteRevision(ctx, fresh, 0, Change{Lists: lists, HasLists: true})
		var e *workspace.Error
		if !errors.As(err, &e) || e.Key != "invalidWorkspace" {
			t.Fatalf("%s, create: %v; want invalidWorkspace", name, err)
		}
		if saved, _ := s.ReadRevision(ctx, fresh); saved != nil {
			t.Fatalf("%s: a refused create left a row", name)
		}
		id := owner(t, conn)
		if _, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.WriteRevision(ctx, id, 1, Change{Lists: lists, HasLists: true}); !errors.As(err, &e) || e.Key != "invalidWorkspace" {
			t.Fatalf("%s, update: %v; want invalidWorkspace", name, err)
		}
		if _, revision, _ := row(t, conn, id); revision != 1 {
			t.Fatalf("%s: revision = %d after a refused save", name, revision)
		}
	}
}
