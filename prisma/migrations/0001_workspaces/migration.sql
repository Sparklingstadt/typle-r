CREATE TABLE IF NOT EXISTS typle_workspaces (
  owner_id text PRIMARY KEY,
  lists jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lists) = 'array'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
