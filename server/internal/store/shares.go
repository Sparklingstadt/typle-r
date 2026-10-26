package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sparklingstadt/typle-r/server/internal/workspace"
)

// A pack shared by link is kept in typle_shared_packs as a snapshot of the pack as a file (workspace.EncodePackFile:
// typle-pack v1, without records, ids, dates or origin). Each pack has at most one link; sharing it again copies the
// pack anew under the same id. Saves that remove a pack delete its link (see deleteRemovedShares).

// MaxSharedPackBytes is the largest snapshot a link keeps.
const MaxSharedPackBytes = 1 << 20

// Share is a link to one of the owner's packs.
type Share struct {
	ID, PackID string
	UpdatedAt  time.Time
}

// PutShare shares the owner's pack packID as it is saved, or copies it again when it is already shared, keeping the
// link. An account that has saved nothing shares from the initial packs it is shown, and its row is not created.
//
// A save that removes the pack at the same moment must delete the link: the row of the workspace is read FOR UPDATE,
// and, for an account without one, the first save waits for the owner's lock (lockOwner) as this does. The save either
// comes first (and the pack is not found) or deletes the link once this is done. A pack not in the workspace is
// packNotFound; a snapshot past MaxSharedPackBytes is invalidWorkspace.
func (s *Store) PutShare(ctx context.Context, owner, packID string) (*Share, error) {
	var share *Share
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := lockOwner(ctx, tx, owner); err != nil {
			return err
		}
		var lists, packs, devices []byte
		var w *workspace.Workspace
		err := tx.QueryRow(ctx, `SELECT lists::text, packs::text, devices::text FROM typle_workspaces WHERE owner_id = $1 FOR UPDATE`,
			owner).Scan(&lists, &packs, &devices)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			if w, err = workspace.Initial(); err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			if w, err = workspace.Decode(lists, devices, packs); err != nil {
				return fmt.Errorf("saved workspace of %s: %w", owner, err)
			}
		}
		data, err := workspace.EncodePackFile(w, packID)
		if err != nil {
			return err
		}
		if len(data) > MaxSharedPackBytes {
			return &workspace.Error{Key: "invalidWorkspace"}
		}
		share = &Share{PackID: packID}
		return tx.QueryRow(ctx, `INSERT INTO typle_shared_packs (id, owner_id, pack_id, data) VALUES ($1, $2, $3, $4::jsonb)
			ON CONFLICT (owner_id, pack_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
			RETURNING id::text, updated_at`, workspace.NewID(), owner, packID, string(data)).Scan(&share.ID, &share.UpdatedAt)
	})
	if err != nil {
		return nil, err
	}
	return share, nil
}

// DeleteShare stops sharing the owner's pack. A pack that is not shared is left as it is, without an error.
func (s *Store) DeleteShare(ctx context.Context, owner, packID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM typle_shared_packs WHERE owner_id = $1 AND pack_id = $2`, owner, packID)
	return err
}

// ListShares returns the owner's links, the most recently updated first.
func (s *Store) ListShares(ctx context.Context, owner string) ([]Share, error) {
	rows, err := s.pool.Query(ctx, `SELECT id::text, pack_id, updated_at FROM typle_shared_packs WHERE owner_id = $1
		ORDER BY updated_at DESC, id`, owner)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Share, error) {
		var share Share
		err := row.Scan(&share.ID, &share.PackID, &share.UpdatedAt)
		return share, err
	})
}

// SharedPack returns the pack file a link shares, written as EncodePackFile wrote it (jsonb keeps neither its spacing
// nor its key order). It is for anyone with the link, so it has nothing of the owner. A link that is not there, or an
// id that is not a UUID, is (nil, nil).
func (s *Store) SharedPack(ctx context.Context, id string) (json.RawMessage, error) {
	if !isUUID(id) {
		return nil, nil
	}
	var data []byte
	err := s.pool.QueryRow(ctx, `SELECT data::text FROM typle_shared_packs WHERE id = $1`, id).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	file, err := workspace.DecodePackFile(data)
	if err != nil {
		return nil, fmt.Errorf("shared pack %s: %w", id, err)
	}
	return file.Encode()
}

// isUUID tells whether id is a UUID as the links are written: 8-4-4-4-12 hexadecimal digits.
func isUUID(id string) bool {
	if len(id) != 36 {
		return false
	}
	for i, c := range id {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !('0' <= c && c <= '9' || 'a' <= c && c <= 'f' || 'A' <= c && c <= 'F') {
				return false
			}
		}
	}
	return true
}

// deleteRemovedShares deletes, in the transaction of a save, the owner's links to packs that are no longer among the
// packs saved.
func deleteRemovedShares(ctx context.Context, tx pgx.Tx, owner string, packs []workspace.Pack) error {
	ids := make([]string, 0, len(packs))
	for _, pack := range packs {
		ids = append(ids, pack.ID)
	}
	_, err := tx.Exec(ctx, `DELETE FROM typle_shared_packs WHERE owner_id = $1 AND NOT (pack_id = ANY($2::text[]))`, owner, ids)
	return err
}

// lockOwner holds the owner's advisory lock until the end of tx. It stands in for the row lock where there is no row
// yet: PutShare takes it, and so does every save that creates the row, so that a link shared from the initial packs is
// seen by the first save's deleteRemovedShares, or the first save is seen by PutShare.
func lockOwner(ctx context.Context, tx pgx.Tx, owner string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('typle_workspaces:' || $1))`, owner)
	return err
}
