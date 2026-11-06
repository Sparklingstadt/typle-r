-- 0033_gallery: the gallery of shared packs (docs/superpowers/specs/2026-11-02-gallery-design.md). A shared pack gets
-- listed_at (when it was put in the gallery; NULL for a link-only share), hidden_at (set by an admin; a hidden share is
-- not shown anywhere but to its owner) and add_count (how often it was added to someone's packs while listed). Reports
-- are kept in a table of their own, removed with the share. Only columns and a table are added, so the app before this
-- migration keeps working on it.
ALTER TABLE "typle_shared_packs"
  ADD COLUMN IF NOT EXISTS "listed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "add_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "typle_gallery_reports" (
  "id" UUID PRIMARY KEY,
  "share_id" UUID NOT NULL REFERENCES "typle_shared_packs" ("id") ON DELETE CASCADE,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "typle_gallery_reports_share" ON "typle_gallery_reports" ("share_id");
