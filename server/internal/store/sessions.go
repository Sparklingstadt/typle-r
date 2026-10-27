package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// The sessions are signed cookies and app tokens, not rows, so signing out of every device is a time kept in
// typle_session_revocations: the sessions of a login no later than it are refused (session.Session.RevokedBy).

// RevokeSessions signs the owner out of every device: every session and app token of a login until now.
func (s *Store) RevokeSessions(ctx context.Context, owner string) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO typle_session_revocations (owner_id, revoked_at) VALUES ($1, now())
		ON CONFLICT (owner_id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at`, owner)
	return err
}

// SessionsRevokedAt is when the owner last signed out of every device, or the zero time when they never did.
func (s *Store) SessionsRevokedAt(ctx context.Context, owner string) (time.Time, error) {
	var revokedAt time.Time
	err := s.pool.QueryRow(ctx, `SELECT revoked_at FROM typle_session_revocations WHERE owner_id = $1`, owner).Scan(&revokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, nil
	}
	return revokedAt, err
}
