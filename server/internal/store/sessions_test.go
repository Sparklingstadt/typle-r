package store

import (
	"context"
	"testing"
	"time"
)

func TestSessionRevocations(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection)
	id := owner(t, conn)
	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), `DELETE FROM typle_session_revocations WHERE owner_id = $1`, id)
	})

	if got, err := s.SessionsRevokedAt(ctx, id); err != nil || !got.IsZero() {
		t.Fatalf("before any revocation = %v, %v", got, err)
	}
	before := time.Now().Add(-time.Minute)
	if err := s.RevokeSessions(ctx, id); err != nil {
		t.Fatal(err)
	}
	first, err := s.SessionsRevokedAt(ctx, id)
	if err != nil || first.Before(before) {
		t.Fatalf("after the first revocation = %v, %v", first, err)
	}
	// Revoking again moves the time on, so the logins since the first are signed out too.
	time.Sleep(10 * time.Millisecond)
	if err := s.RevokeSessions(ctx, id); err != nil {
		t.Fatal(err)
	}
	if second, err := s.SessionsRevokedAt(ctx, id); err != nil || !second.After(first) {
		t.Fatalf("after the second revocation = %v (first %v), %v", second, first, err)
	}
}
