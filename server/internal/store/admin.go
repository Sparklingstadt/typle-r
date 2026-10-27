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

// AdminRecentRows is how many shared packs the dashboard lists, and AdminUsersPage how many accounts one page of the
// user list holds.
const (
	AdminRecentRows = 20
	AdminUsersPage  = 50
)

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

// AdminUser is an account that has saved its workspace, as the user list shows it: how much it holds, not what.
type AdminUser struct {
	OwnerID   string    `json:"ownerId"`
	Lists     int       `json:"lists"`
	Packs     int       `json:"packs"`
	Devices   int       `json:"devices"`
	Shares    int       `json:"shares"`
	Revision  int       `json:"revision"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// AdminUsers is one page of the user list, the most recently updated first, and how many accounts there are in all.
type AdminUsers struct {
	Total int         `json:"total"`
	Users []AdminUser `json:"users"`
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
	Workspaces   int            `json:"workspaces"`
	ActiveDay    int            `json:"activeDay"`
	ActiveWeek   int            `json:"activeWeek"`
	ActiveMonth  int            `json:"activeMonth"`
	SharedPacks  int            `json:"sharedPacks"`
	RecentShares []AdminShare   `json:"recentShares"`
	Admins       []AdminAccount `json:"admins"`
}

// Overview reads the dashboard's figures, all in one read-only transaction so that they agree with each other.
func (s *Store) Overview(ctx context.Context) (*AdminOverview, error) {
	overview := &AdminOverview{RecentShares: []AdminShare{}, Admins: []AdminAccount{}}
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
		rows, err := tx.Query(ctx, `SELECT id::text, owner_id, COALESCE(data #>> '{pack,name}', ''), updated_at
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

// Users reads page (from 0) of the accounts that have saved their workspace, AdminUsersPage at a time, the most
// recently updated first. Guests keep their data in the browser and are not here.
func (s *Store) Users(ctx context.Context, page int) (*AdminUsers, error) {
	users := &AdminUsers{}
	err := pgx.BeginTxFunc(ctx, s.pool, pgx.TxOptions{AccessMode: pgx.ReadOnly, IsoLevel: pgx.RepeatableRead}, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM typle_workspaces`).Scan(&users.Total); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT w.owner_id,
				CASE WHEN jsonb_typeof(w.lists) = 'array' THEN jsonb_array_length(w.lists) ELSE 0 END,
				CASE WHEN jsonb_typeof(w.packs) = 'array' THEN jsonb_array_length(w.packs) ELSE 0 END,
				CASE WHEN jsonb_typeof(w.devices) = 'array' THEN jsonb_array_length(w.devices) ELSE 0 END,
				(SELECT count(*) FROM typle_shared_packs s WHERE s.owner_id = w.owner_id),
				w.revision, w.updated_at
			FROM typle_workspaces w ORDER BY w.updated_at DESC, w.owner_id LIMIT $1 OFFSET $2`,
			AdminUsersPage, page*AdminUsersPage)
		if err != nil {
			return err
		}
		users.Users, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (AdminUser, error) {
			var u AdminUser
			return u, row.Scan(&u.OwnerID, &u.Lists, &u.Packs, &u.Devices, &u.Shares, &u.Revision, &u.UpdatedAt)
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return users, nil
}
