package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// The gallery writes that need no account (a report, a count of additions) are limited per client in fixed windows of
// one minute. client is never an IP address: the caller passes a keyed hash of it. The rows are only for counting, so
// the next count forgets the ones older than galleryHitsKept.

// galleryHitsKept is how long a count stays after its window started. The windows are a minute long, so a row this old
// is long past counting.
const galleryHitsKept = "10 minutes"

// CountGalleryHit counts one more use of action by client in the current minute, and returns how many there are in it
// including this one, and when the minute ends. Counting is a write that cannot be skipped: when it fails the caller
// must not let the request through.
func (s *Store) CountGalleryHit(ctx context.Context, action string, client []byte) (hits int, windowEnd time.Time, err error) {
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM typle_gallery_hits WHERE window_start < now() - interval '`+galleryHitsKept+`'`); err != nil {
			return err
		}
		var start time.Time
		if err := tx.QueryRow(ctx, `INSERT INTO typle_gallery_hits (action, client, window_start, hits)
			VALUES ($1, $2, date_trunc('minute', now()), 1)
			ON CONFLICT (action, client, window_start) DO UPDATE SET hits = typle_gallery_hits.hits + 1
			RETURNING hits, window_start`, action, client).Scan(&hits, &start); err != nil {
			return err
		}
		windowEnd = start.Add(time.Minute)
		return nil
	})
	if err != nil {
		return 0, time.Time{}, err
	}
	return hits, windowEnd, nil
}
