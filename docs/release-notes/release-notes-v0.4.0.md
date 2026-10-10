# v0.4.0 — PrismaによるPostgreSQL永続化

保存処理をPrisma 7.10 ClientとPrisma Migrateに移行しました。

- 既存のtyple_workspacesをWorkspaceモデルに対応付け、単語・記録・revisionを維持。
- 所有者IDでデータを分離し、revision付きの原子的更新で競合を検出。
- Prisma Clientと接続プールを再利用。DockerとNeonをPrismaのPostgreSQLアダプターへ統一。
- 既存DBは `npm run db:baseline`、新規DB・以後の更新は `npm run db:migrate`。baseline前にスキーマ一致を検証。
- npm installとbuild時にClientを生成。Neon HTTPドライバーとPGliteは削除。
- Playwrightを10 workers / fullyParallelに変更し、テストアカウントを分離。

ローカル検証: 型チェック、単体・実DBテスト8件、Lint、本番ビルド、Playwright E2E8件が成功。既存データ保持、新規DB作成、移行済みDBへの再実行も確認しました。現在の8 E2Eテストは8並列で実行します。

既存DBは初回baselineが必要です。旧DATABASE_DRIVER設定は不要になり、Neonのマイグレーション専用接続にはDIRECT_URLを指定できます。詳細はREADMEを参照してください。

GitHub CIとVercelデプロイは引き続き停止中です。Neon実接続は未検証で、既存のNext.js関連の脆弱性の制約も継続します。
