package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
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
	s, err := Open(ctx, connection)
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
	s, err := Open(ctx, connection)
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
	s, err := Open(ctx, connection)
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
	s, err := Open(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.pool.Exec(ctx, `INSERT INTO typle_workspaces (owner_id) VALUES ($1)`, id); err == nil {
		t.Fatal("wrote through the read-only connection")
	}
}
