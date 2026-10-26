-- 0025_shared_packs: 単語パックの共有リンク。data はパックのファイル（typle-pack v1）のスナップショット。
CREATE TABLE "typle_shared_packs" (
  "id" UUID PRIMARY KEY,
  "owner_id" TEXT NOT NULL,
  "pack_id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "typle_shared_packs_owner_pack" UNIQUE ("owner_id", "pack_id")
);
