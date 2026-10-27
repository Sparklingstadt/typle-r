-- 0027_schema: the tables that migrations 0001 to 0026 (v0.4.0–v0.99.4) made, in one migration. Every step changes
-- only what is missing, so a database that applied them all, as production did, is left as it is, and a new one gets
-- the same tables, columns and constraints. The data steps of those migrations (0006 and 0009 to 0023) are not kept:
-- a new database has no workspaces to change.

-- 0001_workspaces: one row per account. revision makes a save of stale data a conflict instead of an overwrite.
CREATE TABLE IF NOT EXISTS typle_workspaces (
  owner_id text PRIMARY KEY,
  lists jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lists) = 'array'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 0002_practice_devices: the devices an account practises on.
ALTER TABLE "typle_workspaces" ADD COLUMN IF NOT EXISTS "devices" JSONB NOT NULL DEFAULT '[]';

-- 0003 to 0008 added profiles, list share links and API tokens, and removed them again (v0.34.0–v0.36.0). A database
-- that still has the profiles column did not run 0006_merge_profiles, which moved the other profiles' lists into
-- "lists"; dropping it would lose them, so such a database must first be migrated with v0.99.4 or earlier.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'typle_workspaces' AND column_name = 'profiles') THEN
    IF EXISTS (SELECT 1 FROM typle_workspaces WHERE profiles <> '[]'::jsonb) THEN
      RAISE EXCEPTION 'typle_workspaces.profiles holds profiles: migrate with v0.99.4 first (0006_merge_profiles)';
    END IF;
    ALTER TABLE typle_workspaces DROP COLUMN profiles;
  END IF;
END $$;
DROP TABLE IF EXISTS "typle_shared_lists";
DROP TABLE IF EXISTS "typle_api_tokens";

-- 0024_packs: word packs. NULL is data saved before packs, which the app and Go convert when they read it.
ALTER TABLE "typle_workspaces" ADD COLUMN IF NOT EXISTS "packs" JSONB;

-- 0025_shared_packs: packs shared by link. data is a snapshot of the pack as a file (typle-pack v1).
CREATE TABLE IF NOT EXISTS "typle_shared_packs" (
  "id" UUID PRIMARY KEY,
  "owner_id" TEXT NOT NULL,
  "pack_id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "typle_shared_packs_owner_pack" UNIQUE ("owner_id", "pack_id")
);

-- 0026_interests: the interests an account chose. NULL is none.
ALTER TABLE "typle_workspaces" ADD COLUMN IF NOT EXISTS "interests" JSONB;
