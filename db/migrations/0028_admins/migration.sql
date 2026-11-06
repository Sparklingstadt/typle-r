-- 0028_admins: the accounts that may sign in to /admin. login is the GitHub login in lower case; github_id is the
-- numeric GitHub user id, recorded at the first sign-in and required to match from then on, so that whoever takes the
-- login over after a rename is not let in. The app lets in only sparklingstadt, and only while its row is here.
CREATE TABLE IF NOT EXISTS "typle_admins" (
  "login" TEXT PRIMARY KEY CHECK ("login" = lower("login")),
  "github_id" BIGINT UNIQUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "last_seen_at" TIMESTAMPTZ(6)
);

INSERT INTO "typle_admins" ("login") VALUES ('sparklingstadt') ON CONFLICT ("login") DO NOTHING;
