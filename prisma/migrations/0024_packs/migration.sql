-- 0024_packs: 単語パック。NULL はまだパック化していない保存データ（アプリと Go が読み込み時に変換する）。
ALTER TABLE "typle_workspaces" ADD COLUMN "packs" JSONB;
