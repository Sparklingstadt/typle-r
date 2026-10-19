-- Lists shared by link. Only the name and words are kept here, never records; the workspace still owns the list.
CREATE TABLE "typle_shared_lists" (
    "share_id" UUID NOT NULL,
    "owner_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "words" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "typle_shared_lists_pkey" PRIMARY KEY ("share_id")
);

CREATE INDEX "typle_shared_lists_owner_id_idx" ON "typle_shared_lists"("owner_id");

CREATE UNIQUE INDEX "typle_shared_lists_owner_id_profile_id_list_id_key" ON "typle_shared_lists"("owner_id", "profile_id", "list_id");
