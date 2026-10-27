-- 0029_admins_ffpf: /admin is reached only through FFPF ID now, so typle_admins is made again, keyed by the account's
-- email in lower case instead of by a GitHub login. ffpf_sub is the FFPF ID sub, recorded at the first sign-in and
-- required to match from then on, so that whoever takes the email over later is not let in. The GitHub rows are
-- dropped with the old table, and no row is added here: the administrators are registered by hand (see the README).
DROP TABLE IF EXISTS "typle_admins";

CREATE TABLE "typle_admins" (
  "email" TEXT PRIMARY KEY CHECK ("email" = lower("email")),
  "ffpf_sub" TEXT UNIQUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "last_seen_at" TIMESTAMPTZ(6)
);
