-- Puts the practice records of typle_records back in their lists, for going back to a version of the app from before
-- the table (v1.2.0 and earlier; docs/superpowers/specs/2026-10-29-record-table.md). Run it against the database before
-- that version serves requests:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/records-rollback.sql
--
-- Each list gets its rows after any records it still holds itself, leaving out a row whose id it already has. The
-- workspace's revision moves on, so a screen that loaded it before saves only after reloading (409). Rows of lists that
-- are no longer saved are dropped with the rest. It runs in one transaction and may be run again.
BEGIN;
LOCK TABLE typle_workspaces IN SHARE ROW EXCLUSIVE MODE;
UPDATE typle_workspaces w SET lists = COALESCE((
    SELECT jsonb_agg(CASE WHEN moved.records IS NULL THEN l.value
      ELSE jsonb_set(l.value, '{records}', COALESCE(l.value -> 'records', '[]'::jsonb) || moved.records) END ORDER BY l.ordinality)
    FROM jsonb_array_elements(w.lists) WITH ORDINALITY AS l(value, ordinality)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(r.data ORDER BY r.position) AS records FROM typle_records r
      WHERE r.owner_id = w.owner_id AND r.list_id = l.value ->> 'id' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(l.value -> 'records', '[]'::jsonb)) AS own(record)
        WHERE own.record ->> 'id' = r.record_id)
    ) AS moved ON true
  ), '[]'::jsonb),
  records_split = false, revision = revision + 1, updated_at = now()
WHERE w.records_split;
DELETE FROM typle_records;
COMMIT;
