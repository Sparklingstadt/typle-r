-- Extra profiles and their word lists. The first profile's lists stay in "lists", so the previous app keeps working.
ALTER TABLE "typle_workspaces" ADD COLUMN "profiles" JSONB NOT NULL DEFAULT '[]';
