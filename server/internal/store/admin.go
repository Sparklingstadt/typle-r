package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// The accounts that may sign in to /admin are kept in typle_admins, by GitHub login in lower case. The numeric GitHub
// user id is bound at the first sign-in, so that whoever takes the login over after a rename is not let in.

// AdminRecentRows is how many workspaces and shared packs the dashboard lists.
const AdminRecentRows = 20

// Admin reports whether the GitHub account login (any case) with the numeric id githubID is an administrator, and if
// so binds the id to the row when it has none yet and records when it was last seen.
func (s *Store) Admin(ctx context.Context, login string, githubID int64) (bool, error) {
	var one int
	err := s.pool.QueryRow(ctx, `UPDATE typle_admins SET github_id = $2, last_seen_at = now()
		WHERE login = $1 AND (github_id IS NULL OR github_id = $2) RETURNING 1`, strings.ToLower(login), githubID).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// AdminAccount is a row of typle_admins.
type AdminAccount struct {
	Login      string     `json:"login"`
	GitHubID   *int64     `json:"githubId"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastSeenAt *time.Time `json:"lastSeenAt"`
}

// AdminWorkspace is a saved workspace as the dashboard lists it: how much it holds, not what.
type AdminWorkspace struct {
	OwnerID   string    `json:"ownerId"`
	Lists     int       `json:"lists"`
	Packs     int       `json:"packs"`
	Devices   int       `json:"devices"`
	Revision  int       `json:"revision"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// AdminShare is a pack shared by link, as the dashboard lists it.
type AdminShare struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"ownerId"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// AdminOverview is what the dashboard shows.
type AdminOverview struct {
	Workspaces       int              `json:"workspaces"`
	ActiveDay        int              `json:"activeDay"`
	ActiveWeek       int              `json:"activeWeek"`
	ActiveMonth      int              `json:"activeMonth"`
	SharedPacks      int              `json:"sharedPacks"`
	RecentWorkspaces []AdminWorkspace `json:"recentWorkspaces"`
	RecentShares     []AdminShare     `json:"recentShares"`
	Admins           []AdminAccount   `json:"admins"`
}

// Overview reads the dashboard's figures, all in one read-only transaction so that they agree with each other.
func (s *Store) Overview(ctx context.Context) (*AdminOverview, error) {
	overview := &AdminOverview{RecentWorkspaces: []AdminWorkspace{}, RecentShares: []AdminShare{}, Admins: []AdminAccount{}}
	err := pgx.BeginTxFunc(ctx, s.pool, pgx.TxOptions{AccessMode: pgx.ReadOnly, IsoLevel: pgx.RepeatableRead}, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT count(*),
				count(*) FILTER (WHERE updated_at > now() - interval '1 day'),
				count(*) FILTER (WHERE updated_at > now() - interval '7 days'),
				count(*) FILTER (WHERE updated_at > now() - interval '30 days'),
				(SELECT count(*) FROM typle_shared_packs)
			FROM typle_workspaces`).Scan(&overview.Workspaces, &overview.ActiveDay, &overview.ActiveWeek,
			&overview.ActiveMonth, &overview.SharedPacks); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT owner_id,
				CASE WHEN jsonb_typeof(lists) = 'array' THEN jsonb_array_length(lists) ELSE 0 END,
				CASE WHEN jsonb_typeof(packs) = 'array' THEN jsonb_array_length(packs) ELSE 0 END,
				CASE WHEN jsonb_typeof(devices) = 'array' THEN jsonb_array_length(devices) ELSE 0 END,
				revision, updated_at
			FROM typle_workspaces ORDER BY updated_at DESC, owner_id LIMIT $1`, AdminRecentRows)
		if err != nil {
			return err
		}
		if overview.RecentWorkspaces, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdminWorkspace, error) {
			var w AdminWorkspace
			return w, row.Scan(&w.OwnerID, &w.Lists, &w.Packs, &w.Devices, &w.Revision, &w.UpdatedAt)
		}); err != nil {
			return err
		}
		rows, err = tx.Query(ctx, `SELECT id::text, owner_id, COALESCE(data #>> '{pack,name}', ''), updated_at
			FROM typle_shared_packs ORDER BY updated_at DESC, id LIMIT $1`, AdminRecentRows)
		if err != nil {
			return err
		}
		if overview.RecentShares, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdminShare, error) {
			var share AdminShare
			return share, row.Scan(&share.ID, &share.OwnerID, &share.Name, &share.UpdatedAt)
		}); err != nil {
			return err
		}
		rows, err = tx.Query(ctx, `SELECT login, github_id, created_at, last_seen_at FROM typle_admins ORDER BY login`)
		if err != nil {
			return err
		}
		overview.Admins, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdminAccount, error) {
			var a AdminAccount
			return a, row.Scan(&a.Login, &a.GitHubID, &a.CreatedAt, &a.LastSeenAt)
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return overview, nil
}
