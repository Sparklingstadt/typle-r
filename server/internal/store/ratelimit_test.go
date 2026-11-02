package store

import (
	"context"
	"crypto/rand"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func randomClient(t *testing.T, conn *pgx.Conn) []byte {
	t.Helper()
	client := make([]byte, 16)
	_, _ = rand.Read(client)
	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), `DELETE FROM typle_gallery_hits WHERE client = $1`, client)
	})
	return client
}

func TestCountGalleryHit(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	client, other := randomClient(t, conn), randomClient(t, conn)

	var end time.Time
	for want := 1; want <= 3; want++ {
		hits, windowEnd, err := s.CountGalleryHit(ctx, "reports", client)
		if err != nil {
			t.Fatal(err)
		}
		if hits != want {
			t.Fatalf("hit %d counted %d", want, hits)
		}
		if want > 1 && !windowEnd.Equal(end) {
			t.Fatalf("window end moved from %v to %v", end, windowEnd)
		}
		end = windowEnd
	}
	// The window ends at the next minute boundary, and is at most a minute away.
	if !end.Equal(end.Truncate(time.Minute)) {
		t.Errorf("window end %v is not on a minute", end)
	}
	if until := time.Until(end); until <= -time.Second || until > time.Minute+time.Second {
		t.Errorf("window end is %v from now", until)
	}

	if hits, _, err := s.CountGalleryHit(ctx, "added", client); err != nil || hits != 1 {
		t.Errorf("another action = %d, %v; want 1", hits, err)
	}
	if hits, _, err := s.CountGalleryHit(ctx, "reports", other); err != nil || hits != 1 {
		t.Errorf("another client = %d, %v; want 1", hits, err)
	}
	if hits, _, err := s.CountGalleryHit(ctx, "reports", client); err != nil || hits != 4 {
		t.Errorf("the first client = %d, %v; want 4", hits, err)
	}
}

func TestCountGalleryHitForgetsOldRows(t *testing.T) {
	ctx := context.Background()
	connection, conn := database(t)
	s := open(t, connection, true)
	old, recent, trigger := randomClient(t, conn), randomClient(t, conn), randomClient(t, conn)
	if _, err := conn.Exec(ctx, `INSERT INTO typle_gallery_hits (action, client, window_start, hits) VALUES
		('reports', $1, date_trunc('minute', now()) - interval '11 minutes', 5),
		('reports', $2, date_trunc('minute', now()) - interval '5 minutes', 5)`, old, recent); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.CountGalleryHit(ctx, "reports", trigger); err != nil {
		t.Fatal(err)
	}
	var oldRows, recentRows int
	if err := conn.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE client = $1)::int, count(*) FILTER (WHERE client = $2)::int FROM typle_gallery_hits`,
		old, recent).Scan(&oldRows, &recentRows); err != nil {
		t.Fatal(err)
	}
	if oldRows != 0 || recentRows != 1 {
		t.Errorf("old rows = %d, recent rows = %d; want 0 and 1", oldRows, recentRows)
	}
}
