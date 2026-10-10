# v0.2.0 — GitHub認証とPostgreSQL永続化

GitHubでログインし、単語リストと練習記録をアカウントごとにPostgreSQLへ保存できるようになりました。

- Auth.js + GitHub OAuth。APIはセッションから所有者を決定し、他アカウントのデータを分離します。
- PostgreSQL JSONB保存、revisionによる同時更新検出、保存失敗時の再試行。
- v0.1.xのブラウザー保存データをホームから明示的に移行。元データ保持、同内容の再移行は重複を防止。
- Docker ComposeでPostgreSQL 17をlocalhost:5433に起動。名前付きボリュームに永続化。
- Neon接続にも対応。初期設定・マイグレーション手順はREADMEに記載。
- Next.js 14.2.35へ更新、未使用のstyle-componentsを削除。

検証: 型チェック、単体テスト8件、Lint、本番ビルド、実PostgreSQL/APIを通すE2E7件。Docker再起動後のデータ保持と、実GitHubアカウントでのローカルログインも確認しました。E2Eではテスト用署名セッションを使用します。

今回はDockerでのローカル仮運用版です。VercelデプロイとNeon実接続は保留・未検証で、Git連携の自動デプロイもvercel.jsonで停止しています。環境変数とOAuth App設定が必要です。

既知の制約: npm auditはNext.js 14と関連依存にhigh 6件を報告しています。公開運用の再開前にサポート中のNext.jsへの移行・再監査が必要です。
