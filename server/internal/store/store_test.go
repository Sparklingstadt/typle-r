package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

func TestConnString(t *testing.T) {
	cases := map[string]string{
		"postgres://u:p@h/db":                                         "postgres://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=":                              "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@db.example:6543/db?channel_binding=require": "postgresql://u:p@db.example:6543/db?channel_binding=require&sslmode=verify-full",
		"postgresql://u:p@10.0.0.5/db":                                "postgresql://u:p@10.0.0.5/db?sslmode=verify-full",
		"postgresql://localhost.example/db":                           "postgresql://localhost.example/db?sslmode=verify-full",
		"postgresql://u:p@localhost,db.example/db":                    "postgresql://u:p@localhost,db.example/db?sslmode=verify-full",
		"postgresql:///db?host=db.example":                            "postgresql:///db?host=db.example&sslmode=verify-full",
		"postgresql://u:p@h/db?uselibpqcompat=true":                   "postgresql://u:p@h/db",
		// This machine needs no TLS.
		"postgresql://u:p@localhost:5432/db":                                    "postgresql://u:p@localhost:5432/db",
		"postgresql://u:p@LOCALHOST/db":                                         "postgresql://u:p@LOCALHOST/db",
		"postgresql://u:p@127.0.0.1:5432/db":                                    "postgresql://u:p@127.0.0.1:5432/db",
		"postgresql://u@127.1.2.3/db":                                           "postgresql://u@127.1.2.3/db",
		"postgresql://u@[::1]:5432/db":                                          "postgresql://u@[::1]:5432/db",
		"postgresql://u@localhost,127.0.0.1:5433/db":                            "postgresql://u@localhost,127.0.0.1:5433/db",
		"postgresql:///db":                                                      "postgresql:///db",
		"postgresql:///db?host=%2Fvar%2Frun%2Fpostgresql":                       "postgresql:///db?host=%2Fvar%2Frun%2Fpostgresql",
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
		_, _ = conn.Exec(context.Background(), `DELETE FROM typle_shared_packs WHERE owner_id = $1`, id)
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

// An account that has saved nothing starts empty (since v0.98.0), as in the app.
func TestReadWithoutRowGivesInitialWorkspace(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s, err := Open(ctx, connection, false)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	w, err := s.Read(ctx, owner(t, conn))
	if err != nil || w.Lists == nil || w.Packs == nil || len(w.Lists) != 0 || len(w.Packs) != 0 {
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
	w, err := s.Modify(ctx, id, createList("a"))
	if err != nil {
		t.Fatal(err)
	}
	read, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	// The change is made to the empty initial workspace.
	for _, got := range []*workspace.Workspace{w, read} {
		if len(got.Lists) != 1 || got.Lists[0].Name != "a" || len(got.Packs) != 1 {
			t.Fatalf("lists = %+v", got.Lists)
		}
	}
	// Inserting the initial workspace made revision 1; the change made 2.
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
	initial, err := workspace.Initial()
	if err != nil {
		t.Fatal(err)
	}
	// The initial lists and all ten.
	if len(w.Lists) != len(initial.Lists)+10 {
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
	// The copy goes in its source's pack.
	want := `{"id": "c1", "name": "英単語（コピー）", "words": [{"input": "a", "display": "a", "reading": "エー", "annotation": ""}], "packId": "pack-l1", "records": [], "createdAt": "2026-10-21T00:00:00.000Z"}`
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
	// A new account starts with the initial lists; the imported one is added after them.
	want := `{"id": "i1", "name": "動物", "words": [{"input": "neko", "display": "猫,ねこ", "annotation": "1行目\n2行目"}], "packId": "pack-i1", "records": [], "createdAt": "2026-10-21T00:00:00.000Z"}]`
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

// decoded reads a saved workspace, as the app does with the answer of /api/workspace.
func decoded(t *testing.T, saved *Saved) *workspace.Workspace {
	t.Helper()
	w, err := workspace.Decode(saved.Lists, saved.Devices, saved.Packs)
	if err != nil {
		t.Fatalf("saved %s %s %s: %v", saved.Lists, saved.Packs, saved.Devices, err)
	}
	return w
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
	if saved.Revision != 1 || len(decoded(t, saved).Lists) != 2 || len(decoded(t, saved).Devices) != 1 {
		t.Fatalf("saved = %+v", saved)
	}
	read, err := s.ReadRevision(ctx, id)
	if err != nil || read == nil || read.Revision != 1 || len(decoded(t, read).Lists) != 2 {
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
	if len(decoded(t, saved).Lists) != 0 || len(decoded(t, saved).Devices) != 1 {
		t.Fatalf("saved = %+v", decoded(t, saved))
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
	if saved.Revision != 2 || len(decoded(t, saved).Lists) != 3 {
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
	if saved.Revision != 2 || len(decoded(t, saved).Lists) != 2 || len(decoded(t, saved).Devices) != 1 {
		t.Fatalf("saved = %+v", decoded(t, saved))
	}
	saved, err = s.WriteRevision(ctx, id, 2, Change{Lists: newLists(1), HasLists: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(decoded(t, saved).Lists) != 1 || len(decoded(t, saved).Devices) != 1 {
		t.Fatalf("saved = %+v", decoded(t, saved))
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
	if got := decoded(t, saved).Lists[0].Words[0].Extra; got != `{"x":{"a":[1,2]}}` {
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

// An update reads only the saved revision and number of lists, not the lists themselves: saved lists that Decode would
// refuse are replaced by a save of new lists, and kept as they are, in the database, by a save of the devices alone.
func TestWriteRevisionDoesNotDecodeSavedLists(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	const unreadable = `[{"id": "x"}]`
	replaced, kept := owner(t, conn), owner(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists) VALUES ($1, $3), ($2, $3)`, replaced, kept, unreadable); err != nil {
		t.Fatal(err)
	}
	saved, err := s.WriteRevision(ctx, replaced, 1, Change{Lists: newLists(1), HasLists: true})
	if err != nil || saved.Revision != 2 {
		t.Fatalf("replacing unreadable lists: %+v, %v", saved, err)
	}
	if _, err := s.ReadRevision(ctx, replaced); err != nil {
		t.Fatalf("the replaced lists do not load: %v", err)
	}
	saved, err = s.WriteRevision(ctx, kept, 1, Change{Devices: []workspace.Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}, HasDevices: true})
	if err != nil || saved.Revision != 2 {
		t.Fatalf("saving devices beside unreadable lists: %+v, %v", saved, err)
	}
	var devices string
	if err := conn.QueryRow(ctx, `SELECT devices::text FROM typle_workspaces WHERE owner_id = $1`, kept).Scan(&devices); err != nil {
		t.Fatal(err)
	}
	if lists, _, _ := row(t, conn, kept); lists != unreadable || !strings.Contains(devices, `"d1"`) {
		t.Fatalf("lists = %s, devices = %s", lists, devices)
	}
}

// packsColumn is the owner's packs column as stored, or nil when it is NULL.
func packsColumn(t *testing.T, conn *pgx.Conn, id string) []workspace.Pack {
	t.Helper()
	var packs *string
	if err := conn.QueryRow(context.Background(), `SELECT packs::text FROM typle_workspaces WHERE owner_id = $1`, id).Scan(&packs); err != nil {
		t.Fatal(err)
	}
	if packs == nil {
		return nil
	}
	var stored []struct {
		ID       string   `json:"id"`
		Name     string   `json:"name"`
		Category string   `json:"category"`
		Tags     []string `json:"tags"`
	}
	if err := json.Unmarshal([]byte(*packs), &stored); err != nil {
		t.Fatal(err)
	}
	result := make([]workspace.Pack, 0, len(stored))
	for _, pack := range stored {
		result = append(result, workspace.Pack{ID: pack.ID, Name: pack.Name, Category: pack.Category, Tags: pack.Tags})
	}
	return result
}

// A row saved before packs existed (packs NULL) is turned into packs when it is read, as the app does.
func TestReadConvertsRowWithoutPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	lists := `[{"id":"l1","name":"基本","group":"Linux","category":"プログラミング","tags":["シェル"],"createdAt":"2026-10-10T01:23:45.000Z",` +
		`"words":[{"display":"ls","input":"ls","annotation":""}],"records":[]},` +
		`{"id":"l2","name":"応用","group":"Linux","createdAt":"2026-10-11T01:23:45.000Z","words":[{"display":"cd","input":"cd","annotation":""}],"records":[]}]`
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2, '[]')`, id, lists); err != nil {
		t.Fatal(err)
	}
	s := open(t, connection, false)
	w, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Packs) != 1 || w.Packs[0].ID != "pack-l1" || w.Packs[0].Name != "Linux" || w.Packs[0].Category != "プログラミング" ||
		w.Lists[1].PackID != "pack-l1" || w.Lists[1].Category != "プログラミング" {
		t.Fatalf("packs = %+v, lists = %+v", w.Packs, w.Lists)
	}
	saved, err := s.ReadRevision(ctx, id)
	if err != nil || saved.Packs != nil {
		t.Fatalf("ReadRevision = %+v, %v; want packs NULL as nil", saved, err)
	}
}

// Modify writes the packs with the lists: a new list gets a pack of its own, and a new category goes to the pack, not
// the list. A row Modify inserts starts with the packs of the initial lists.
func TestModifyWritesPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	var created string
	if _, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		name := "動物"
		list, err := workspace.CreateList(w, workspace.ListInput{Name: &name, Words: []workspace.Word{{Display: "a", Input: "a"}}},
			workspace.NewID(), time.Now())
		if err == nil {
			created = list.ID
		}
		return true, err
	}); err != nil {
		t.Fatal(err)
	}
	initial, err := workspace.Initial()
	if err != nil {
		t.Fatal(err)
	}
	packs := packsColumn(t, conn, id)
	if len(packs) != len(initial.Packs)+1 || packs[len(packs)-1].ID != "pack-"+created || packs[len(packs)-1].Name != "動物" {
		t.Fatalf("packs = %+v", packs)
	}
	read, err := s.Read(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	for i, list := range initial.Lists {
		if read.Lists[i].Category != list.Category || !slices.Equal(read.Lists[i].Tags, list.Tags) {
			t.Fatalf("list %d = %+v; want the labels of %+v", i, read.Lists[i], list)
		}
	}
	category := "生き物"
	w, err := s.Modify(ctx, id, func(w *workspace.Workspace) (bool, error) {
		_, err := workspace.UpdateList(w, created, workspace.ListInput{Category: &category})
		return true, err
	})
	if err != nil {
		t.Fatal(err)
	}
	if list := w.Find(created); list == nil || list.Category != category || list.PackID != "pack-"+created {
		t.Fatalf("result = %+v", list)
	}
	packs = packsColumn(t, conn, id)
	if packs[len(packs)-1].Category != category {
		t.Fatalf("packs = %+v", packs)
	}
	if lists, _, _ := row(t, conn, id); strings.Contains(lists, `"category"`) || strings.Contains(lists, category) {
		t.Fatalf("lists = %s", lists)
	}
}

// A save with packs writes them; a save of lists alone, from an app that does not know packs, keeps the saved packs
// and the labels on its lists, which the next read moves into packs.
func TestWriteRevisionPacks(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	lists := newLists(1)
	lists[0].PackID = "p"
	packs := []workspace.Pack{{ID: "p", Name: "P", Category: "C", CreatedAt: "2026-10-10T01:23:45.000Z"}}
	saved, err := s.WriteRevision(ctx, id, 0, Change{Lists: lists, Packs: packs, HasLists: true, HasPacks: true})
	if err != nil {
		t.Fatal(err)
	}
	if w := decoded(t, saved); len(w.Packs) != 1 || w.Packs[0].Category != "C" || w.Lists[0].Category != "C" {
		t.Fatalf("saved = %s %s", saved.Lists, saved.Packs)
	}
	sent := newLists(2)
	sent[0].PackID = "p"
	sent[1].Category, sent[1].Tags = "語学", []string{"英語"}
	saved, err = s.WriteRevision(ctx, id, 1, Change{Lists: sent, HasLists: true})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(saved.Lists), `"語学"`) || !strings.Contains(string(saved.Packs), `"C"`) {
		t.Fatalf("saved = %s %s", saved.Lists, saved.Packs)
	}
	w := decoded(t, saved)
	if len(w.Packs) != 2 || w.Lists[0].PackID != "p" || w.Lists[1].Category != "語学" || w.Find("l1").PackID == "p" {
		t.Fatalf("packs = %+v, lists = %+v", w.Packs, w.Lists)
	}
	// A row created without packs is one saved before them: NULL.
	other := owner(t, conn)
	if saved, err := s.WriteRevision(ctx, other, 0, Change{Lists: sent, HasLists: true}); err != nil || saved.Packs != nil {
		t.Fatalf("saved = %+v, %v", saved, err)
	}
}

// interests reads the saved interests as the app would.
func interests(t *testing.T, saved *Saved) []string {
	t.Helper()
	got, err := workspace.DecodeInterests(saved.Interests)
	if err != nil {
		t.Fatalf("interests %s: %v", saved.Interests, err)
	}
	return got
}

// The interests have a column of their own: saved with a change that sets them, kept by one that leaves them out, and
// nil (NULL) for a row without them, which the app reads as the default.
func TestWriteRevisionInterests(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	saved, err := s.WriteRevision(ctx, id, 0, Change{Lists: newLists(1), HasLists: true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Interests != nil {
		t.Fatalf("interests of a new row = %s", saved.Interests)
	}
	chosen := []string{"language", "language/zh", "x/unknown"}
	if saved, err = s.WriteRevision(ctx, id, 1, Change{Interests: chosen, HasInterests: true}); err != nil {
		t.Fatal(err)
	}
	if saved.Revision != 2 || !slices.Equal(interests(t, saved), chosen) || len(decoded(t, saved).Lists) != 1 {
		t.Fatalf("saved = %+v", saved)
	}
	read, err := s.ReadRevision(ctx, id)
	if err != nil || !slices.Equal(interests(t, read), chosen) {
		t.Fatalf("ReadRevision = %+v, %v", read, err)
	}
	// Lists or devices alone leave the interests as they are.
	if saved, err = s.WriteRevision(ctx, id, 2, Change{Lists: newLists(2), HasLists: true}); err != nil {
		t.Fatal(err)
	}
	if saved, err = s.WriteRevision(ctx, id, 3, Change{Devices: []workspace.Device{{ID: "d1", Name: "自宅", Layout: "JIS"}}, HasDevices: true}); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(interests(t, saved), chosen) || len(decoded(t, saved).Lists) != 2 {
		t.Fatalf("saved = %+v", saved)
	}
	// So does a change through /api/v1.
	if _, err := s.Modify(ctx, id, createList("b")); err != nil {
		t.Fatal(err)
	}
	if read, err = s.ReadRevision(ctx, id); err != nil || !slices.Equal(interests(t, read), chosen) {
		t.Fatalf("after Modify: %+v, %v", read, err)
	}
	// They can be emptied.
	if saved, err = s.WriteRevision(ctx, id, read.Revision, Change{Interests: nil, HasInterests: true}); err != nil {
		t.Fatal(err)
	}
	if string(saved.Interests) != "[]" {
		t.Fatalf("emptied interests = %s", saved.Interests)
	}
}

func TestWriteRevisionCreateInterests(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	saved, err := s.WriteRevision(ctx, id, 0, Change{Interests: []string{"programming"}, HasInterests: true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision != 1 || !slices.Equal(interests(t, saved), []string{"programming"}) || len(decoded(t, saved).Lists) != 0 {
		t.Fatalf("saved = %+v", saved)
	}
}

// Interests the app would refuse are never saved: the change is refused as an invalid workspace, before the database.
func TestWriteRevisionRefusesInvalidInterests(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	s := open(t, connection, true)
	for name, invalid := range map[string][]string{
		"duplicate": {"language", "language"},
		"empty":     {""},
		"too long":  {strings.Repeat("a", workspace.MaxInterestLength+1)},
	} {
		_, err := s.WriteRevision(ctx, id, 0, Change{Interests: invalid, HasInterests: true})
		var e *workspace.Error
		if !errors.As(err, &e) || e.Key != "invalidWorkspace" {
			t.Fatalf("%s: %v; want invalidWorkspace", name, err)
		}
	}
	if saved, err := s.ReadRevision(ctx, id); saved != nil || err != nil {
		t.Fatalf("a refused create left a row (%v, %v)", saved, err)
	}
}

// A row whose interests the app would refuse is refused when read, as its lists would be.
func TestReadRevisionRefusesInvalidInterests(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	id := owner(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices, interests) VALUES ($1, '[]', '[]', '["a","a"]')`, id); err != nil {
		t.Fatal(err)
	}
	s := open(t, connection, false)
	if saved, err := s.ReadRevision(ctx, id); err == nil {
		t.Fatalf("ReadRevision = %+v; want an error", saved)
	}
}

// An administrator's row is keyed by FFPF ID email, binds the sub of the first sign-in, and lets in only that sub from
// then on. The email may be written in any case.
func TestAdmin(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s, err := OpenApp(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	email := strings.ToLower(strings.TrimPrefix(owner(t, conn), "go-test:")) + "@example.com"
	t.Cleanup(func() { _, _ = conn.Exec(context.Background(), `DELETE FROM typle_admins WHERE email = $1`, email) })
	if ok, err := s.Admin(ctx, email, "sub1"); err != nil || ok {
		t.Fatalf("Admin without a row = %v, %v", ok, err)
	}
	if _, err := conn.Exec(ctx, `INSERT INTO typle_admins (email) VALUES ($1)`, email); err != nil {
		t.Fatal(err)
	}
	// An empty sub is not bound to the row, and an empty email is nobody.
	for _, pair := range [][2]string{{email, ""}, {"", "sub1"}, {"", ""}} {
		if ok, err := s.Admin(ctx, pair[0], pair[1]); err != nil || ok {
			t.Fatalf("Admin(%q, %q) = %v, %v", pair[0], pair[1], ok, err)
		}
	}
	var bound *string
	if err := conn.QueryRow(ctx, `SELECT ffpf_sub FROM typle_admins WHERE email = $1`, email).Scan(&bound); err != nil || bound != nil {
		t.Fatalf("ffpf_sub = %v, %v", bound, err)
	}
	if ok, err := s.Admin(ctx, strings.ToUpper(email), "sub1"); err != nil || !ok {
		t.Fatalf("first Admin = %v, %v", ok, err)
	}
	var sub string
	var seen *time.Time
	if err := conn.QueryRow(ctx, `SELECT ffpf_sub, last_seen_at FROM typle_admins WHERE email = $1`, email).Scan(&sub, &seen); err != nil || sub != "sub1" || seen == nil {
		t.Fatalf("row = %q %v, %v", sub, seen, err)
	}
	if ok, err := s.Admin(ctx, email, "sub2"); err != nil || ok {
		t.Fatalf("Admin with another sub = %v, %v", ok, err)
	}
	if ok, err := s.Admin(ctx, email, "sub1"); err != nil || !ok {
		t.Fatalf("Admin again = %v, %v", ok, err)
	}
	// An email that is not in lower case cannot be stored.
	if _, err := conn.Exec(ctx, `INSERT INTO typle_admins (email) VALUES ('Admin@example.com')`); err == nil {
		t.Fatal("a mixed-case email was stored")
	}
}

func TestOverview(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s, err := OpenApp(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	before, err := s.Overview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	id := owner(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices, packs, revision, updated_at)
		VALUES ($1, '[{"id":"a"},{"id":"b"}]', '[{"id":"d"}]', NULL, 4, now() + interval '1 hour')`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(ctx, `INSERT INTO typle_shared_packs (id, owner_id, pack_id, data, updated_at)
		VALUES (gen_random_uuid(), $1, 'p', '{"pack":{"name":"Words"}}', now() + interval '1 hour')`, id); err != nil {
		t.Fatal(err)
	}
	adminEmail := strings.ToLower(strings.TrimPrefix(id, "go-test:")) + "@example.com"
	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), `DELETE FROM typle_admins WHERE email = $1`, adminEmail)
	})
	if _, err := conn.Exec(ctx, `INSERT INTO typle_admins (email) VALUES ($1)`, adminEmail); err != nil {
		t.Fatal(err)
	}
	after, err := s.Overview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if after.Workspaces != before.Workspaces+1 || after.ActiveDay != before.ActiveDay+1 || after.ActiveMonth != before.ActiveMonth+1 ||
		after.SharedPacks != before.SharedPacks+1 {
		t.Fatalf("before %+v, after %+v", before, after)
	}
	users, err := s.Users(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	if users.Total != after.Workspaces || len(users.Users) > AdminUsersPage {
		t.Fatalf("users: total %d, %d on the page", users.Total, len(users.Users))
	}
	if got := users.Users[0]; got.OwnerID != id || got.Lists != 2 || got.Packs != 0 || got.Devices != 1 || got.Shares != 1 || got.Revision != 4 {
		t.Fatalf("first user = %+v", got)
	}
	// A page past the last is empty, not an error.
	if past, err := s.Users(ctx, users.Total/AdminUsersPage+1); err != nil || past.Total != users.Total || len(past.Users) != 0 {
		t.Fatalf("page past the last = %+v, %v", past, err)
	}
	if got := after.RecentShares[0]; got.OwnerID != id || got.Name != "Words" {
		t.Fatalf("recent share = %+v", got)
	}
	if !slices.ContainsFunc(after.Admins, func(a AdminAccount) bool { return a.Email == adminEmail && a.FFPFSub == nil }) {
		t.Fatalf("admins = %+v", after.Admins)
	}
}
