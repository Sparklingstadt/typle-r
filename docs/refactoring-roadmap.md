# リファクタリングのロードマップ

2026-11-06 に v2.36.0 のコードを棚卸しして、直す順番を決めたものです。1項目を1つの PR にし、機能の変更と混ぜません。終わった項目はこのファイルから消します。

## 終わったこと

段階 0〜2 は v2.36.1 から v2.36.14 で、#16 は v2.36.19 で終わりました。`/api/v1` と `typle-api` は使う人がいないので v2.36.20 で消しました。

- 検査: `staticcheck`・`knip`・単体テストのカバレッジ、`.claude` を除いた `npm run lint`、`cn` の import の規則を CI に入れました。
- 依存: 範囲内の依存を更新し、Prisma をなくしました。マイグレーションは `db/migrations` の SQL を `scripts/migrate.cjs` が適用します（事故の手順は `docs/release-workflow.md`）。
- 画面: 旧 `Page`／`PageContainer` を消し、200 行を超えていた画面を分けました。
- TS と Go: 上限値を `tests/fixtures` の共通の fixture で照合しています。
- CI: `verify` を Node・Go・E2E の並列ジョブに分けました。
- 文書: 実装済みの計画を `docs/superpowers/plans/archive` に移しました。

## 残っていること

設計の判断が要るので、決めてから進めます。

| # | 項目 | 決めること |
|---|---|---|
| 11 | GraphQL を消す | GraphQL を使う古い版の iPad・Mac 版が使われなくなったのを、いつ・どう確かめて消すか |

- **#11 iPad・Mac** — Web は v2.41.1 で GraphQL から REST へ戻りました（`src/core/api.ts`）。iPad・Mac 版も 11/13 に REST へ戻りました。`/api/graphql` は、11/6〜11/13 の GraphQL を使う版がまだ手元に残っているかもしれないので残しています。その版が使われなくなったら、`server/internal/web/graphql.go`・`server/internal/web/graph`・gqlgen の依存・`api-docs/src/app/graphql.md` を消します。

メジャーの依存の更新（ESLint 10・TypeScript 7・`@types/node` 26・`cn` 0.5）は、1つずつ別の PR にします。範囲内の依存の更新は月に1回、1つの PR にまとめます。

## 進め方の約束

- 1 PR に1項目。機能の変更と混ぜず、バージョンはパッチを上げます（`CLAUDE.md` の Release workflow）。
- リファクタリングの PR では `tests/e2e/` と `src/messages/` を変えません。変えたくなったら動作が変わった合図です。
- 新しいファイルは 200 行以下。処理は書き換えずに移し、見つけたバグは直さずにこのファイルか Issue に記録します。
- 見た目が変わるときは、そのことを PR のタイトルに書きます。
