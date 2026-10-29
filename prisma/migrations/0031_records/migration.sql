-- 0031_records: practice records in a table of their own instead of in each list's records array (docs/superpowers/specs/
-- 2026-10-29-record-table.md). A workspace's records move when it is next written (records_split); until then they stay
-- in its lists. Only a table and a column are added, so the app before this migration keeps working on it.
CREATE TABLE IF NOT EXISTS "typle_records" (
  "owner_id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "at" TIMESTAMPTZ(6) NOT NULL,
  "data" JSONB NOT NULL,
  CONSTRAINT "typle_records_pkey" PRIMARY KEY ("owner_id", "list_id", "record_id")
);
CREATE INDEX IF NOT EXISTS "typle_records_list_at" ON "typle_records" ("owner_id", "list_id", "at" DESC);
ALTER TABLE "typle_workspaces" ADD COLUMN IF NOT EXISTS "records_split" BOOLEAN NOT NULL DEFAULT false;
