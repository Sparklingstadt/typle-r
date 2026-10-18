-- 0006_merge_profiles merged every account's profiles, and since v0.35.1 the app neither reads nor writes these
-- columns, so the app of the previous version keeps working while this runs.
ALTER TABLE "typle_workspaces" DROP COLUMN "profiles";
-- Also drops the unique index on (owner_id, profile_id, list_id); the one on (owner_id, list_id) from 0006 stays.
ALTER TABLE "typle_shared_lists" DROP COLUMN "profile_id";
