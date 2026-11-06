-- 0030_session_revocations: when an account last signed out of every device. A session cookie or an app token of a
-- login no later than revoked_at is refused, though its signature is good: the sessions are signed, not stored, so this
-- is the one way to stop a stolen one before it expires. An account that never did so has no row.
CREATE TABLE IF NOT EXISTS "typle_session_revocations" (
  "owner_id" TEXT PRIMARY KEY,
  "revoked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
