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
		"postgres://u:p@h/db":                                           "postgres://u:p@h/db",
		"postgresql://u:p@h/db?sslmode=require":                         "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=prefer":                          "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=verify-ca":                       "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=disable":                         "postgresql://u:p@h/db?sslmode=disable",
		"postgresql://u:p@h/db?sslmode=verify-full":                     "postgresql://u:p@h/db?sslmode=verify-full",
		"postgresql://u:p@h/db?channel_binding=require&sslmode=require": "postgresql://u:p@h/db?channel_binding=require&sslmode=verify-full",
		"postgresql://u:p@h/db?sslmode=require&uselibpqcompat=true":     "postgresql://u:p@h/db?sslmode=require",
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
