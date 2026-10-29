-- 0032_drop_legacy: deletes the workspaces still saved in a shape from before v1.0.0, which the app no longer reads,
-- with their practice records and shared links: rows without packs (saved before packs existed), and rows with a
-- list that has no pack or keeps the group, category or tags an app before packs wrote on it. Accounts start again
-- from an empty workspace. Workspaces saved by v1.0.0 and later keep everything.
WITH legacy AS (
  SELECT w.owner_id FROM typle_workspaces w
  WHERE w.packs IS NULL OR jsonb_typeof(w.packs) <> 'array' OR CASE WHEN jsonb_typeof(w.lists) = 'array'
    THEN EXISTS (SELECT 1 FROM jsonb_array_elements(w.lists) AS l(list) WHERE CASE WHEN jsonb_typeof(l.list) = 'object'
      THEN NOT (l.list ? 'packId') OR l.list ? 'group' OR l.list ? 'category' OR l.list ? 'tags' ELSE true END)
    ELSE true END
), shares AS (
  DELETE FROM typle_shared_packs s USING legacy WHERE s.owner_id = legacy.owner_id
), records AS (
  DELETE FROM typle_records r USING legacy WHERE r.owner_id = legacy.owner_id
)
DELETE FROM typle_workspaces w USING legacy WHERE w.owner_id = legacy.owner_id;
