// Package store reads and writes accounts' workspaces in the app's database (the typle_workspaces table, see
// prisma/schema.prisma). Unless it is opened writable, the connection is read-only: every transaction it starts is
// READ ONLY.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// ConnString keeps the server certificate verified, as the app's database connection did before the Go
// backend: sslmode=prefer, require and verify-ca become verify-full. uselibpqcompat=true, which asks node-postgres
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
// initial workspace, as in the app: empty since v0.98.0.
func (s *Store) Read(ctx context.Context, owner string) (*workspace.Workspace, error) {
	var lists, packs, devices []byte
	err := s.pool.QueryRow(ctx, `SELECT lists::text, packs::text, devices::text FROM typle_workspaces WHERE owner_id = $1`, owner).
		Scan(&lists, &packs, &devices)
	if errors.Is(err, pgx.ErrNoRows) {
		return workspace.Initial()
	}
	if err != nil {
		return nil, err
	}
	w, err := workspace.Decode(lists, devices, packs)
	if err != nil {
		return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
	}
	return w, nil
}

// Modify changes the owner's workspace and saves it, in one transaction that holds the row locked. While it is held,
// a save from the app waits; afterwards the app finds the revision changed and reloads (409), as it does when another
// browser saved first. An account that has saved nothing starts from the initial workspace. When change reports nothing
// changed, nothing is written.
//
// change edits the lists as Decode shows them, with their packs' category and tags; ApplyListChange then puts those
// edits back into the packs, so the workspace returned has its lists in their packs (a new list in a pack of its own)
// and both are written. Anything change keeps of the workspace, such as a pointer into its lists, is from before that:
// find the list again in the workspace returned. The links to packs the change removed are deleted with it.
func (s *Store) Modify(ctx context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error) {
	var result *workspace.Workspace
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		w, err := lock(ctx, tx, owner)
		if err != nil {
			return err
		}
		lists, packs, err := encodeLibrary(w)
		if err != nil {
			return err
		}
		// ApplyListChange reads the lists and packs as they were; change may edit the lists in place.
		previous := &workspace.Workspace{Lists: slices.Clone(w.Lists), Packs: slices.Clone(w.Packs)}
		changed, err := change(w)
		if err != nil {
			return err
		}
		w.ApplyListChange(previous)
		result = w
		if !changed {
			return nil
		}
		after, afterPacks, err := encodeLibrary(w)
		if err != nil {
			return err
		}
		if err := workspace.CheckSize(len(lists)+len(packs), len(after)+len(afterPacks)); err != nil {
			return err
		}
		devices, err := workspace.EncodeDevices(w.Devices)
		if err != nil {
			return err
		}
		// A workspace that would not be read back is never saved: the account would no longer load, here or in the app.
		if _, err := workspace.Decode(after, devices, afterPacks); err != nil {
			return fmt.Errorf("changed workspace of %s: %w", owner, err)
		}
		if _, err := tx.Exec(ctx, `UPDATE typle_workspaces SET lists = $2::jsonb, packs = $3::jsonb, devices = $4::jsonb,
			revision = revision + 1, updated_at = now() WHERE owner_id = $1`, owner, string(after), string(afterPacks), string(devices)); err != nil {
			return err
		}
		return deleteRemovedShares(ctx, tx, owner, w.Packs)
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// encodeLibrary writes the lists and packs of w as they are saved.
func encodeLibrary(w *workspace.Workspace) (lists, packs []byte, err error) {
	if lists, err = workspace.Encode(w.Lists); err != nil {
		return nil, nil, err
	}
	packs, err = workspace.EncodePacks(w.Packs)
	return lists, packs, err
}

// lock reads the owner's row FOR UPDATE, first inserting one with the initial workspace when there is
// none. Another request may insert it at the same moment; the row is then read and locked once that request is done
// with it.
func lock(ctx context.Context, tx pgx.Tx, owner string) (*workspace.Workspace, error) {
	for inserted := false; ; inserted = true {
		var lists, packs, devices []byte
		err := tx.QueryRow(ctx, `SELECT lists::text, packs::text, devices::text FROM typle_workspaces WHERE owner_id = $1 FOR UPDATE`,
			owner).Scan(&lists, &packs, &devices)
		if err == nil {
			w, err := workspace.Decode(lists, devices, packs)
			if err != nil {
				return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
			}
			return w, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) || inserted {
			return nil, err
		}
		// As the first save does (see lockOwner), so that the links PutShare made from the initial packs are seen.
		if err := lockOwner(ctx, tx, owner); err != nil {
			return nil, err
		}
		initial, err := workspace.Initial()
		if err != nil {
			return nil, err
		}
		encoded, encodedPacks, err := encodeLibrary(initial)
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, packs, devices) VALUES ($1, $2::jsonb, $3::jsonb, '[]'::jsonb)
			ON CONFLICT (owner_id) DO NOTHING`, owner, string(encoded), string(encodedPacks)); err != nil {
			return nil, err
		}
	}
}

// Saved is a workspace as stored: its lists, packs and devices columns as JSON, with the revision a later save must
// name. The JSON is the database's own text of the jsonb, so object keys may be in another order than they were
// written in. Packs is nil, which is JSON's null, when the column is NULL: the lists were saved before packs existed.
type Saved struct {
	Lists, Packs, Devices json.RawMessage
	Revision              int
}

// Change is what a save sets. A part that is not set (HasLists, HasPacks, HasDevices) stays as it is. Packs are set
// only with the lists they hold, which are then written without labels (workspace.Encode). Lists set without packs
// come from an app that does not know packs: they are written as it sent them, labels and all
// (workspace.EncodeWithLabels), for Decode to settle with the saved packs when they are read.
type Change struct {
	Lists      []workspace.List
	Packs      []workspace.Pack
	Devices    []workspace.Device
	HasLists   bool
	HasPacks   bool
	HasDevices bool
}

// ReadRevision returns the owner's saved workspace with its revision, or nil when nothing has been saved. Unlike Read
// it does not make up the initial workspace: the app's /api/workspace answers revision 0 for an account without a row. The row
// is checked with Decode, so saved data that Go cannot read is an error, but it is answered as stored (the jsonb text),
// not as Go decoded it. Data that Go reads and the app's decodeLists or decodeDevices refuses therefore reaches the
// browser, which says savedDataCorrupted, rather than being quietly changed here.
func (s *Store) ReadRevision(ctx context.Context, owner string) (*Saved, error) {
	saved, err := scanSaved(s.pool.QueryRow(ctx,
		`SELECT lists::text, packs::text, devices::text, revision FROM typle_workspaces WHERE owner_id = $1`, owner))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err := workspace.Decode(saved.Lists, saved.Devices, saved.Packs); err != nil {
		return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
	}
	return saved, nil
}

// WriteRevision saves change over the workspace at revision: revision 0 creates the row, any other revision replaces
// what is saved only if it is still that revision (else ErrConflict). Lists may be more than MaxLists in saved data
// merged from removed profiles; a save may keep or lower that number, never raise it. The size of the lists is not
// checked here: the /api/workspace handler (server/internal/web) only limits the request.
//
// It returns ErrConflict for a stale revision, a *workspace.Error for lists past the limits of validateLists or packs
// without lists (invalidWorkspace) or more lists than allowed (listLimit), and any other error when the change cannot
// be written. Whether packs hold their lists (workspace.CheckLibrary) is the handler's to check, on what was sent. A
// change that Decode would refuse is never written: the account would no longer load, here or in the app. All of this,
// apart from the conflict and the saved number of lists, is checked before the database is touched.
//
// What is saved is not read back through Decode, except lists saved without packs (to find the packs they leave): only
// the saved revision and number of lists are read, a part left out is kept by the UPDATE itself, and the result is the
// row's JSON as stored. When packs are saved, the links to packs no longer among them are deleted in the same
// transaction. So are those of lists saved without packs, against the packs the row then has (derived from the lists
// when it has none); devices alone leave the links as they are.
func (s *Store) WriteRevision(ctx context.Context, owner string, revision int, change Change) (*Saved, error) {
	// nil is a part left out: NULL in the queries below.
	var lists, packs, devices []byte
	var err error
	if change.HasPacks && !change.HasLists {
		return nil, &workspace.Error{Key: "invalidWorkspace"}
	}
	if change.HasLists {
		if err := workspace.CheckLimits(change.Lists); err != nil {
			return nil, err
		}
		encode := workspace.EncodeWithLabels
		if change.HasPacks {
			encode = workspace.Encode
			if packs, err = workspace.EncodePacks(change.Packs); err != nil {
				return nil, err
			}
		}
		if lists, err = encode(change.Lists); err != nil {
			return nil, err
		}
	}
	if change.HasDevices {
		if devices, err = workspace.EncodeDevices(change.Devices); err != nil {
			return nil, err
		}
	}
	// A part left out is saved as it is, so only the other one can be refused; it is read with an empty one. Lists
	// without packs are read as lists saved before packs existed.
	if _, err := workspace.Decode(orEmpty(lists), orEmpty(devices), packs); err != nil {
		return nil, fmt.Errorf("changed workspace of %s: %w", owner, err)
	}
	var saved *Saved
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var err error
		if saved, err = writeRevision(ctx, tx, owner, revision, change, lists, packs, devices); err != nil {
			return err
		}
		switch {
		case change.HasPacks:
			return deleteRemovedShares(ctx, tx, owner, change.Packs)
		case change.HasLists:
			// Lists without packs: the packs are the saved ones, or those derived from the saved lists.
			w, err := workspace.Decode(saved.Lists, saved.Devices, saved.Packs)
			if err != nil {
				return fmt.Errorf("saved workspace of %s: %w", owner, err)
			}
			return deleteRemovedShares(ctx, tx, owner, w.Packs)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return saved, nil
}

// writeRevision writes the parts of WriteRevision, encoded (nil for a part left out), in tx.
func writeRevision(ctx context.Context, tx pgx.Tx, owner string, revision int, change Change, lists, packs, devices []byte) (*Saved, error) {
	if revision == 0 {
		if len(change.Lists) > workspace.MaxLists {
			return nil, &workspace.Error{Key: "listLimit"}
		}
		// The links PutShare made from the initial packs are seen by deleteRemovedShares (see lockOwner).
		if err := lockOwner(ctx, tx, owner); err != nil {
			return nil, err
		}
		// Unique owner makes the existence check and the insert one atomic operation.
		saved, err := scanSaved(tx.QueryRow(ctx, `INSERT INTO typle_workspaces (owner_id, lists, packs, devices)
			VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb) ON CONFLICT (owner_id) DO NOTHING
			RETURNING lists::text, packs::text, devices::text, revision`,
			owner, string(orEmpty(lists)), nullable(packs), string(orEmpty(devices))))
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConflict
		}
		return saved, err
	}
	var savedRevision, savedLists int
	err := tx.QueryRow(ctx, `SELECT revision, jsonb_array_length(lists) FROM typle_workspaces WHERE owner_id = $1`, owner).
		Scan(&savedRevision, &savedLists)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && savedRevision != revision) {
		return nil, ErrConflict
	}
	if err != nil {
		return nil, err
	}
	if len(change.Lists) > workspace.MaxLists && len(change.Lists) > savedLists {
		return nil, &workspace.Error{Key: "listLimit"}
	}
	// Matching the revision in the UPDATE itself makes the comparison and the write one atomic operation.
	saved, err := scanSaved(tx.QueryRow(ctx, `UPDATE typle_workspaces SET lists = COALESCE($3::jsonb, lists),
		packs = COALESCE($4::jsonb, packs), devices = COALESCE($5::jsonb, devices), revision = revision + 1, updated_at = now()
		WHERE owner_id = $1 AND revision = $2 RETURNING lists::text, packs::text, devices::text, revision`,
		owner, revision, nullable(lists), nullable(packs), nullable(devices)))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrConflict
	}
	return saved, err
}

func orEmpty(part []byte) []byte {
	if part == nil {
		return []byte("[]")
	}
	return part
}

// nullable is a part to write as a query argument: NULL when it is left out.
func nullable(part []byte) any {
	if part == nil {
		return nil
	}
	return string(part)
}

// scanSaved reads a row as stored: its lists, packs, devices and revision. A no-rows error is passed on as it is.
func scanSaved(row pgx.Row) (*Saved, error) {
	var lists, packs, devices []byte
	var revision int
	if err := row.Scan(&lists, &packs, &devices, &revision); err != nil {
		return nil, err
	}
	return &Saved{Lists: lists, Packs: packs, Devices: devices, Revision: revision}, nil
}
