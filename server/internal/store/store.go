// Package store reads and writes accounts' workspaces in the app's database (the typle_workspaces table, see
// prisma/schema.prisma). Unless it is opened writable, the connection is read-only: every transaction it starts is
// READ ONLY.
package store

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"time"

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

// ErrConflict means the revision a save was made against is no longer the saved one, or the workspace it expected to
// create is already there. The app reloads and asks again (409).
var ErrConflict = errors.New("workspace revision is stale")

type Store struct{ pool *pgxpool.Pool }

// Open connects to the database and checks that it answers. Only a writable store can Modify.
func Open(ctx context.Context, connection string, writable bool) (*Store, error) {
	return connect(ctx, connection, func(config *pgxpool.Config) {
		if !writable {
			config.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
		}
	})
}

// OpenApp connects as the app's backend does, writable and with a small pool: a serverless instance serves one request
// at a time, and the database allows few connections in all. Connections idle for 30 seconds are closed.
func OpenApp(ctx context.Context, connection string) (*Store, error) {
	return connect(ctx, connection, func(config *pgxpool.Config) {
		config.MaxConns = 5
		config.MaxConnIdleTime = 30 * time.Second
	})
}

func connect(ctx context.Context, connection string, configure func(*pgxpool.Config)) (*Store, error) {
	strict, err := ConnString(connection)
	if err != nil {
		return nil, err
	}
	config, err := pgxpool.ParseConfig(strict)
	if err != nil {
		return nil, fmt.Errorf("database URL: %w", err)
	}
	configure(config)
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

// Ping checks that the database answers.
func (s *Store) Ping(ctx context.Context) error {
	var one int
	return s.pool.QueryRow(ctx, `SELECT 1`).Scan(&one)
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
// changed, nothing is written.
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
		devices, err := workspace.EncodeDevices(w.Devices)
		if err != nil {
			return err
		}
		// A workspace that would not be read back is never saved: the account would no longer load, here or in the app.
		if _, err := workspace.Decode(after, devices); err != nil {
			return fmt.Errorf("changed workspace of %s: %w", owner, err)
		}
		_, err = tx.Exec(ctx, `UPDATE typle_workspaces SET lists = $2::jsonb, devices = $3::jsonb, revision = revision + 1,
			updated_at = now() WHERE owner_id = $1`, owner, string(after), string(devices))
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

// Saved is a workspace as stored, with the revision a later save must name.
type Saved struct {
	Workspace *workspace.Workspace
	Revision  int
}

// Change is what a save sets. A part that is not set (HasLists, HasDevices) stays as it is.
type Change struct {
	Lists      []workspace.List
	Devices    []workspace.Device
	HasLists   bool
	HasDevices bool
}

// ReadRevision returns the owner's saved workspace with its revision, or nil when nothing has been saved. Unlike Read
// it does not make up initial lists: the app's /api/workspace answers revision 0 for an account without a row.
func (s *Store) ReadRevision(ctx context.Context, owner string) (*Saved, error) {
	saved, err := scanSaved(s.pool.QueryRow(ctx,
		`SELECT lists::text, devices::text, revision FROM typle_workspaces WHERE owner_id = $1`, owner), owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return saved, err
}

// WriteRevision saves change over the workspace at revision, as workspaceRepository.write does in the app: revision 0
// creates the row, any other revision replaces what is saved only if it is still that revision (else ErrConflict).
// Lists may be more than MaxLists in saved data merged from removed profiles; a save may keep or lower that number,
// never raise it. The size of the lists is not checked here: the app's route only limits the request.
func (s *Store) WriteRevision(ctx context.Context, owner string, revision int, change Change) (*Saved, error) {
	lists, devices := []byte("[]"), []byte("[]")
	var err error
	if change.HasLists {
		if lists, err = workspace.Encode(change.Lists); err != nil {
			return nil, err
		}
	}
	if change.HasDevices {
		if devices, err = workspace.EncodeDevices(change.Devices); err != nil {
			return nil, err
		}
	}
	if revision == 0 {
		if len(change.Lists) > workspace.MaxLists {
			return nil, &workspace.Error{Key: "listLimit"}
		}
		// Unique owner makes the existence check and the insert one atomic operation.
		saved, err := scanSaved(s.pool.QueryRow(ctx, `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2::jsonb, $3::jsonb)
			ON CONFLICT (owner_id) DO NOTHING RETURNING lists::text, devices::text, revision`, owner, string(lists), string(devices)), owner)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConflict
		}
		return saved, err
	}
	var savedLists, savedDevices []byte
	var savedRevision int
	err = s.pool.QueryRow(ctx, `SELECT lists::text, devices::text, revision FROM typle_workspaces WHERE owner_id = $1`, owner).
		Scan(&savedLists, &savedDevices, &savedRevision)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && savedRevision != revision) {
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	current, err := workspace.Decode(savedLists, savedDevices)
	if err != nil {
		return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
	}
	if len(change.Lists) > workspace.MaxLists && len(change.Lists) > len(current.Lists) {
		return nil, &workspace.Error{Key: "listLimit"}
	}
	if !change.HasLists {
		lists = savedLists
	}
	if !change.HasDevices {
		devices = savedDevices
	}
	// Matching the revision in the UPDATE itself makes the comparison and the write one atomic operation.
	saved, err := scanSaved(s.pool.QueryRow(ctx, `UPDATE typle_workspaces SET lists = $3::jsonb, devices = $4::jsonb,
		revision = revision + 1, updated_at = now() WHERE owner_id = $1 AND revision = $2
		RETURNING lists::text, devices::text, revision`, owner, revision, string(lists), string(devices)), owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrConflict
	}
	return saved, err
}

// scanSaved reads a row back through Decode, so that what is answered is exactly what is stored. A no-rows error is
// passed on as it is.
func scanSaved(row pgx.Row, owner string) (*Saved, error) {
	var lists, devices []byte
	var revision int
	if err := row.Scan(&lists, &devices, &revision); err != nil {
		return nil, err
	}
	w, err := workspace.Decode(lists, devices)
	if err != nil {
		return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
	}
	return &Saved{Workspace: w, Revision: revision}, nil
}
