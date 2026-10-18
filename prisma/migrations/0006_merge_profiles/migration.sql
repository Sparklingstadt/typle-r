-- Profiles were removed in v0.34.0, whose app merges a workspace's other profiles into the first one when it next
-- reads it. This merges the workspaces nobody has opened since, the same way, so the app can stop reading "profiles"
-- and "profile_id" and a later migration can drop them. The app of v0.34.0 and later reads the result as it is.
--
-- As in src/core/workspaceDocument.ts: each other profile's lists follow the first one's with their records; a name
-- already in use gets the profile's name after it, an id already in use becomes "<profile id>-<list id>". The new
-- revision makes a screen that read the data before get a conflict instead of overwriting the merged lists.
DO $$
DECLARE
  workspace RECORD;
  profile RECORD;
  item RECORD;
  merged JSONB;
  ids TEXT[];
  names TEXT[];
  new_id TEXT;
  new_name TEXT;
  suffix TEXT;
  attempt INT;
BEGIN
  FOR workspace IN SELECT owner_id, lists, profiles FROM typle_workspaces WHERE profiles <> '[]'::jsonb FOR UPDATE LOOP
    merged := workspace.lists;
    SELECT coalesce(array_agg(lower(value->>'id')), '{}'), coalesce(array_agg(lower(btrim(value->>'name'))), '{}')
      INTO ids, names FROM jsonb_array_elements(workspace.lists);
    FOR profile IN SELECT value, ordinality FROM jsonb_array_elements(workspace.profiles) WITH ORDINALITY
                   WHERE ordinality > 1 ORDER BY ordinality LOOP
      FOR item IN SELECT value, ordinality FROM jsonb_array_elements(coalesce(profile.value->'lists', '[]'::jsonb)) WITH ORDINALITY
                  ORDER BY ordinality LOOP
        new_id := item.value->>'id';
        attempt := 2;
        WHILE lower(new_id) = ANY(ids) LOOP
          new_id := (profile.value->>'id') || '-' || (item.value->>'id') || CASE WHEN attempt > 2 THEN '-' || (attempt - 1) ELSE '' END;
          attempt := attempt + 1;
        END LOOP;
        ids := ids || lower(new_id);
        new_name := btrim(item.value->>'name');
        attempt := 2;
        WHILE lower(new_name) = ANY(names) LOOP
          suffix := '（' || btrim(profile.value->>'name') || CASE WHEN attempt > 2 THEN ' ' || (attempt - 1) ELSE '' END || '）';
          new_name := rtrim(left(btrim(item.value->>'name'), 200 - length(suffix))) || suffix;
          attempt := attempt + 1;
        END LOOP;
        names := names || lower(new_name);
        merged := merged || jsonb_build_array(item.value || jsonb_build_object('id', new_id, 'name', new_name));
        -- A shared list keeps its link. A row of the first profile with the new id can only be left over.
        IF item.value->'shared' = 'true'::jsonb THEN
          DELETE FROM typle_shared_lists WHERE owner_id = workspace.owner_id AND profile_id = 'default' AND list_id = new_id;
          UPDATE typle_shared_lists SET profile_id = 'default', list_id = new_id
            WHERE owner_id = workspace.owner_id AND profile_id = profile.value->>'id' AND list_id = item.value->>'id';
        END IF;
      END LOOP;
    END LOOP;
    UPDATE typle_workspaces SET lists = merged, profiles = '[]'::jsonb, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE owner_id = workspace.owner_id;
  END LOOP;
  -- What is left in other profiles are links of lists that are gone, which the app removes on its next save anyway.
  DELETE FROM typle_shared_lists WHERE profile_id <> 'default';
END $$;

-- The app no longer writes "profile_id"; every link now belongs to the first profile, so a list has at most one link.
ALTER TABLE "typle_shared_lists" ALTER COLUMN "profile_id" SET DEFAULT 'default';
CREATE UNIQUE INDEX "typle_shared_lists_owner_id_list_id_key" ON "typle_shared_lists"("owner_id", "list_id");
