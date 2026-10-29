// Package store reads and writes accounts' workspaces in the app's database (the typle_workspaces table, and their
// practice records in typle_records: see records.go and prisma/schema.prisma). Unless it is opened writable, the connection is read-only: every transaction it starts is
// READ ONLY.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// ConnString keeps the server certificate verified, as the app's database connection did before the Go
// backend: sslmode=prefer, require and verify-ca become verify-full. uselibpqcompat=true, which asks node-postgres
// for libpq's meaning of those modes, is pgx's own behaviour, so it keeps the mode and only the parameter is dropped.
// A URL without sslmode (or with an empty one) is verify-full too, unless every host it names is this machine (localHosts): pgx's default,
// prefer, neither checks the certificate nor insists on TLS at all.
func ConnString(connection string) (string, error) {
	parsed, err := url.Parse(connection)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return "", errors.New("database URL must be a postgres:// or postgresql:// URL")
	}
	query := parsed.Query()
	libpq := query.Get("uselibpqcompat") == "true"
	query.Del("uselibpqcompat")
	if !libpq {
		switch query.Get("sslmode") {
		case "prefer", "require", "verify-ca":
			query.Set("sslmode", "verify-full")
		case "":
			if !localHosts(parsed, query) {
				query.Set("sslmode", "verify-full")
			}
		}
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

// localHosts reports whether every host the URL connects to is this machine: localhost, 127.0.0.0/8, ::1, a Unix
// socket directory, or no host at all (pgx's default socket). The host query parameter, as pgx reads it, wins over
// the URL's, and either may list several hosts separated by commas.
func localHosts(parsed *url.URL, query url.Values) bool {
	hosts := query.Get("host")
	if hosts == "" {
		hosts = parsed.Host
	}
	for _, host := range strings.Split(hosts, ",") {
		if strings.HasPrefix(host, "/") {
			continue
		}
		if name, _, err := net.SplitHostPort(host); err == nil {
			host = name
		}
		host = strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(host, "["), "]"))
		if host == "" || host == "localhost" {
			continue
		}
		if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
			return false
		}
	}
	return true
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
	saved, err := readSaved(ctx, s.pool, owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return workspace.Initial()
	}
	if err != nil {
		return nil, err
	}
	w, err := workspace.Decode(saved.Lists, saved.Devices, saved.Packs)
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
		w, before, err := lock(ctx, tx, owner)
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
		// Records are given ids before anything is encoded, so the workspace returned and the rows agree.
		rows, err := recordRows(w.Lists)
		if err != nil {
			return err
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
		stored, err := workspace.Encode(withoutRecords(workspace.WithoutFollowedWords(w.Packs, w.Lists)))
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE typle_workspaces SET lists = $2::jsonb, packs = $3::jsonb, devices = $4::jsonb,
			records_split = true, revision = revision + 1, updated_at = now() WHERE owner_id = $1`,
			owner, string(stored), string(afterPacks), string(devices)); err != nil {
			return err
		}
		if err := syncRecords(ctx, tx, owner, before, rows); err != nil {
			return err
		}
		return deleteRemovedShares(ctx, tx, owner, w.Packs)
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// encodeLibrary writes the lists and packs of w as the app saves them: the lists with their records, and without the
// words of followed packs (workspace.WithoutFollowedWords).
func encodeLibrary(w *workspace.Workspace) (lists, packs []byte, err error) {
	if lists, err = workspace.Encode(workspace.WithoutFollowedWords(w.Packs, w.Lists)); err != nil {
		return nil, nil, err
	}
	packs, err = workspace.EncodePacks(w.Packs)
	return lists, packs, err
}

// lock reads the owner's row FOR UPDATE, first inserting one with the initial workspace when there is
// none. Another request may insert it at the same moment; the row is then read and locked once that request is done
// with it. The records are read after the row is locked, so that no write can come between: before is them as rows
// (beforeRows), or nil when the workspace's records have not moved to typle_records yet.
func lock(ctx context.Context, tx pgx.Tx, owner string) (w *workspace.Workspace, before map[recordKey]recordRow, err error) {
	for inserted := false; ; inserted = true {
		var lists, packs, devices []byte
		var split bool
		err := tx.QueryRow(ctx, `SELECT lists::text, packs::text, devices::text, records_split FROM typle_workspaces
			WHERE owner_id = $1 FOR UPDATE`, owner).Scan(&lists, &packs, &devices, &split)
		if err == nil {
			if split {
				records, stored, err := readRecords(ctx, tx, owner)
				if err != nil {
					return nil, nil, err
				}
				if lists, err = withRecords(lists, records); err != nil {
					return nil, nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
				}
				if before, err = beforeRows(stored); err != nil {
					return nil, nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
				}
			}
			w, err := workspace.Decode(lists, devices, packs)
			if err != nil {
				return nil, nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
			}
			return w, before, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) || inserted {
			return nil, nil, err
		}
		// As the first save does (see lockOwner), so that the links PutShare made from the initial packs are seen.
		if err := lockOwner(ctx, tx, owner); err != nil {
			return nil, nil, err
		}
		initial, err := workspace.Initial()
		if err != nil {
			return nil, nil, err
		}
		encoded, encodedPacks, err := encodeLibrary(initial)
		if err != nil {
			return nil, nil, err
		}
		// The initial lists have no records, so the row starts with them in typle_records.
		created, err := tx.Exec(ctx, `INSERT INTO typle_workspaces (owner_id, lists, packs, devices, records_split)
			VALUES ($1, $2::jsonb, $3::jsonb, '[]'::jsonb, true) ON CONFLICT (owner_id) DO NOTHING`,
			owner, string(encoded), string(encodedPacks))
		if err == nil && created.RowsAffected() == 1 {
			err = forgetRecords(ctx, tx, owner)
		}
		if err != nil {
			return nil, nil, err
		}
	}
}

// Saved is a workspace as stored: its lists, packs, devices and interests columns as JSON, with the revision a later
// save must name. The JSON is the database's own text of the jsonb, so object keys may be in another order than they
// were written in. Packs is nil, which is JSON's null, when the column is NULL: the lists were saved before packs
// existed. Interests are nil when their column is NULL: none have been saved.
type Saved struct {
	Lists, Packs, Devices, Interests json.RawMessage
	Revision                         int
}

// Change is what a save sets. A part that is not set (HasLists, HasPacks, HasDevices, HasInterests) stays as it is.
// Interests are only the app's: Modify, which /api/v1 changes the workspace with, leaves them as they are. Packs are set
// only with their lists, which are written without labels (workspace.Encode); lists set without packs are each put in
// a pack of their own.
type Change struct {
	Lists        []workspace.List
	Packs        []workspace.Pack
	Devices      []workspace.Device
	Interests    []string
	HasLists     bool
	HasPacks     bool
	HasDevices   bool
	HasInterests bool
}

// ReadRevision returns the owner's saved workspace with its revision, or nil when nothing has been saved. Unlike Read
// it does not make up the initial workspace: the app's /api/workspace answers revision 0 for an account without a row. The row
// is checked with Decode, so saved data that Go cannot read is an error, but it is answered as stored (the jsonb text,
// with the records of typle_records put back in their lists), not as Go decoded it. Data that Go reads and the app's decodeLists or decodeDevices refuses therefore reaches the
// browser, which says savedDataCorrupted, rather than being quietly changed here.
func (s *Store) ReadRevision(ctx context.Context, owner string) (*Saved, error) {
	saved, err := readSaved(ctx, s.pool, owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err := workspace.Decode(saved.Lists, saved.Devices, saved.Packs); err != nil {
		return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
	}
	if _, err := workspace.DecodeInterests(saved.Interests); err != nil {
		return nil, fmt.Errorf("saved interests of %s: %w", owner, err)
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
// What is saved is not read back through Decode: only the saved revision and number of lists are read, a part left out
// is kept by the UPDATE itself, and the result is the row's JSON as stored, with its records put back in its lists.
// Lists saved bring their records: those of typle_records become exactly theirs (see records.go), and the row's
// records_split is set. When packs are saved, the links to packs no longer among them are deleted in the same
// transaction; devices or interests alone leave the links as they are.
func (s *Store) WriteRevision(ctx context.Context, owner string, revision int, change Change) (*Saved, error) {
	// nil is a part left out: NULL in the queries below. full is the lists with their records, as the app sent them;
	// lists, as the column keeps them, have none: rows are their records, for typle_records.
	var lists, full, packs, devices, interests []byte
	var rows []recordRow
	var err error
	// Packs are saved only with their lists. Lists sent without packs are each put in a pack of their own, as Decode
	// repairs lists without one.
	if change.HasPacks && !change.HasLists {
		return nil, &workspace.Error{Key: "invalidWorkspace"}
	}
	if change.HasLists && !change.HasPacks {
		if err := workspace.CheckLimits(change.Lists); err != nil {
			return nil, err
		}
		encoded, err := workspace.Encode(change.Lists)
		if err != nil {
			return nil, err
		}
		repaired, err := workspace.Decode(encoded, []byte("[]"), []byte("[]"))
		if err != nil {
			return nil, fmt.Errorf("changed workspace of %s: %w", owner, err)
		}
		change.Lists, change.Packs, change.HasPacks = repaired.Lists, repaired.Packs, true
	}
	if change.HasLists {
		if err := workspace.CheckLimits(change.Lists); err != nil {
			return nil, err
		}
		if packs, err = workspace.EncodePacks(change.Packs); err != nil {
			return nil, err
		}
		if rows, err = recordRows(change.Lists); err != nil {
			return nil, err
		}
		// Followed packs' lists are saved without their words, which the catalog has.
		slim := workspace.WithoutFollowedWords(change.Packs, change.Lists)
		if full, err = workspace.Encode(slim); err != nil {
			return nil, err
		}
		if lists, err = workspace.Encode(withoutRecords(slim)); err != nil {
			return nil, err
		}
	}
	if change.HasDevices {
		if devices, err = workspace.EncodeDevices(change.Devices); err != nil {
			return nil, err
		}
	}
	if change.HasInterests {
		// Interests the app would refuse are refused as the request would be.
		if err := workspace.CheckInterests(change.Interests); err != nil {
			return nil, &workspace.Error{Key: "invalidWorkspace"}
		}
		if interests, err = workspace.EncodeInterests(change.Interests); err != nil {
			return nil, err
		}
	}
	// A part left out is saved as it is, so only the other one can be refused; it is read with an empty one.
	if _, err := workspace.Decode(orEmpty(full), orEmpty(devices), orEmpty(packs)); err != nil {
		return nil, fmt.Errorf("changed workspace of %s: %w", owner, err)
	}
	var saved *Saved
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := writeRevision(ctx, tx, owner, revision, change, lists, packs, devices, interests); err != nil {
			return err
		}
		// Lists saved bring their records: the owner's rows become exactly theirs.
		if change.HasLists {
			if err := syncRecords(ctx, tx, owner, nil, rows); err != nil {
				return err
			}
		}
		var err error
		if saved, err = readSaved(ctx, tx, owner); err != nil {
			return err
		}
		if change.HasPacks {
			return deleteRemovedShares(ctx, tx, owner, change.Packs)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return saved, nil
}

// writeRevision writes the parts of WriteRevision, encoded (nil for a part left out), in tx. Lists written have their
// records in typle_records (records_split), which the caller then writes.
func writeRevision(ctx context.Context, tx pgx.Tx, owner string, revision int, change Change, lists, packs, devices, interests []byte) error {
	if revision == 0 {
		if len(change.Lists) > workspace.MaxLists {
			return &workspace.Error{Key: "listLimit"}
		}
		// The links PutShare made from the initial packs are seen by deleteRemovedShares (see lockOwner).
		if err := lockOwner(ctx, tx, owner); err != nil {
			return err
		}
		// Unique owner makes the existence check and the insert one atomic operation.
		err := tx.QueryRow(ctx, `INSERT INTO typle_workspaces (owner_id, lists, packs, devices, interests, records_split)
			VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, true) ON CONFLICT (owner_id) DO NOTHING RETURNING revision`,
			owner, string(orEmpty(lists)), nullable(packs), string(orEmpty(devices)), nullable(interests)).Scan(new(int))
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConflict
		}
		if err != nil {
			return err
		}
		return forgetRecords(ctx, tx, owner)
	}
	var savedRevision, savedLists int
	err := tx.QueryRow(ctx, `SELECT revision, jsonb_array_length(lists) FROM typle_workspaces WHERE owner_id = $1`, owner).
		Scan(&savedRevision, &savedLists)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && savedRevision != revision) {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if len(change.Lists) > workspace.MaxLists && len(change.Lists) > savedLists {
		return &workspace.Error{Key: "listLimit"}
	}
	// Matching the revision in the UPDATE itself makes the comparison and the write one atomic operation.
	err = tx.QueryRow(ctx, `UPDATE typle_workspaces SET lists = COALESCE($3::jsonb, lists),
		packs = COALESCE($4::jsonb, packs), devices = COALESCE($5::jsonb, devices), interests = COALESCE($6::jsonb, interests),
		records_split = records_split OR $3::jsonb IS NOT NULL, revision = revision + 1, updated_at = now()
		WHERE owner_id = $1 AND revision = $2 RETURNING revision`,
		owner, revision, nullable(lists), nullable(packs), nullable(devices), nullable(interests)).Scan(new(int))
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConflict
	}
	return err
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

// readSaved reads the owner's row as stored, with its records put back in its lists (see withRecords), in one
// statement. A no-rows error is passed on as it is.
func readSaved(ctx context.Context, q querier, owner string) (*Saved, error) {
	var lists, packs, devices, interests, records []byte
	var revision int
	err := q.QueryRow(ctx, `SELECT lists::text, packs::text, devices::text, interests::text, revision, `+recordsColumn+`
		FROM typle_workspaces WHERE owner_id = $1`, owner).Scan(&lists, &packs, &devices, &interests, &revision, &records)
	if err != nil {
		return nil, err
	}
	if records != nil {
		stored, err := decodeColumn(records)
		if err != nil {
			return nil, fmt.Errorf("records of %s: %w", owner, err)
		}
		if lists, err = withRecords(lists, stored); err != nil {
			return nil, fmt.Errorf("saved workspace of %s: %w", owner, err)
		}
	}
	// Interests not saved (NULL) are read as nil.
	return &Saved{Lists: lists, Packs: packs, Devices: devices, Interests: interests, Revision: revision}, nil
}
