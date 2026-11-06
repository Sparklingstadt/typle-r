-- 0034_gallery_rate_limit: how often a client used the two gallery writes that need no account (POST
-- /api/gallery/reports and /api/gallery/added) in each minute, so that the Go backend can refuse the ones over the
-- limit. client is a keyed hash of the IP address, never the address. Rows older than 10 minutes are deleted by the
-- next count. Only a table is added, so the app before this migration keeps working on it.
CREATE TABLE IF NOT EXISTS "typle_gallery_hits" (
  "action" TEXT NOT NULL,
  "client" BYTEA NOT NULL,
  "window_start" TIMESTAMPTZ(6) NOT NULL,
  "hits" INTEGER NOT NULL,
  PRIMARY KEY ("action", "client", "window_start")
);
CREATE INDEX IF NOT EXISTS "typle_gallery_hits_window" ON "typle_gallery_hits" ("window_start");
