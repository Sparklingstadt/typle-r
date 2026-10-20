// Package store reads and writes accounts' workspaces in the app's database (the typle_workspaces table, see
// prisma/schema.prisma). Unless it is opened writable, the connection is read-only: every transaction it starts is
// READ ONLY.
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

// Open connects to the database and checks that it answers. Only a writable store can Modify.
func Open(ctx context.Context, connection string, writable bool) (*Store, error) {
	strict, err := ConnString(connection)
	if err != nil {
		return nil, err
	}
	config, err := pgxpool.ParseConfig(strict)
	if err != nil {
		return nil, fmt.Errorf("database URL: %w", err)
	}
	if !writable {
		config.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	}
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

// Modify changes the owner's workspace and saves it, in one transaction that holds the row locked. While it is held,
// a save from the app waits; afterwards the app finds the revision changed and reloads (409), as it does when another
// browser saved first. An account that has saved nothing starts from the initial lists. When change reports nothing
// changed, nothing is written. Only the lists are written: devices are not changed here.
func (s *Store) Modify(ctx context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error) {
	var result *workspace.Workspace
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		w, err := lock(ctx, tx, owner)
		if err != nil {
			return err
		}
		before, err := workspace.Encode(w.Lists)
		if err != nil {
			return err
		}
		changed, err := change(w)
		if err != nil {
			return err
		}
		result = w
		if !changed {
			return nil
		}
		after, err := workspace.Encode(w.Lists)
		if err != nil {
			return err
		}
		if err := workspace.CheckSize(len(before), len(after)); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE typle_workspaces SET lists = $2::jsonb, revision = revision + 1, updated_at = now() WHERE owner_id = $1`,
			owner, string(after))
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// lock reads the owner's row FOR UPDATE, first inserting one with the initial lists when there is none. Another
// request may insert it at the same moment; the row is then read and locked once that request is done with it.
func lock(ctx context.Context, tx pgx.Tx, owner string) (*workspace.Workspace, error) {
	for inserted := false; ; inserted = true {
		var lists, devices []byte
		err := tx.QueryRow(ctx, `SELECT lists::text, devices::text FROM typle_workspaces WHERE owner_id = $1 FOR UPDATE`, owner).
			Scan(&lists, &devices)
		if err == nil {
			w, err := workspace.Decode(lists, devices)
			if err != nil {
				return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
			}
			return w, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) || inserted {
			return nil, err
		}
		initial, err := workspace.Initial()
		if err != nil {
			return nil, err
		}
		encoded, err := workspace.Encode(initial.Lists)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2::jsonb, '[]'::jsonb)
			ON CONFLICT (owner_id) DO NOTHING`, owner, string(encoded)); err != nil {
			return nil, err
		}
	}
}
