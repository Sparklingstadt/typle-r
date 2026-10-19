// Package store reads accounts' workspaces from the app's database (the typle_workspaces table, see
// prisma/schema.prisma). The connection is read-only: every transaction it starts is READ ONLY.
package store

import (
	"context"
	"errors"
	"fmt"
	"net/url"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// ConnString keeps the server certificate verified, as strictSslUrl (src/plugins/storage/cloud/databaseUrl.ts) does
// for the app: sslmode=prefer, require and verify-ca become verify-full. uselibpqcompat=true, which asks node-postgres
// for libpq's meaning of those modes, is pgx's own behaviour, so it keeps the mode and only the parameter is dropped.
func ConnString(connection string) (string, error) {
	parsed, err := url.Parse(connection)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return "", errors.New("database URL must be a postgres:// or postgresql:// URL")
	}
	query := parsed.Query()
	libpq := query.Get("uselibpqcompat") == "true"
	query.Del("uselibpqcompat")
	switch query.Get("sslmode") {
	case "prefer", "require", "verify-ca":
		if !libpq {
			query.Set("sslmode", "verify-full")
		}
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

type Store struct{ pool *pgxpool.Pool }

// Open connects to the database and checks that it answers.
func Open(ctx context.Context, connection string) (*Store, error) {
	strict, err := ConnString(connection)
	if err != nil {
		return nil, err
	}
	config, err := pgxpool.ParseConfig(strict)
	if err != nil {
		return nil, fmt.Errorf("database URL: %w", err)
	}
	config.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// Read returns the owner's saved workspace, such as github:12345's. An account that has saved nothing yet has the
// initial lists, as in the app.
func (s *Store) Read(ctx context.Context, owner string) (*workspace.Workspace, error) {
	var lists, devices []byte
	err := s.pool.QueryRow(ctx, `SELECT lists::text, devices::text FROM typle_workspaces WHERE owner_id = $1`, owner).
		Scan(&lists, &devices)
	if errors.Is(err, pgx.ErrNoRows) {
		return workspace.Initial()
	}
	if err != nil {
		return nil, err
	}
	w, err := workspace.Decode(lists, devices)
	if err != nil {
		return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
	}
	return w, nil
}
