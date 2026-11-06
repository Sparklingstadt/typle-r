# リファクタリングのロードマップ

2026-11-06 に v2.36.0 のコードを棚卸しして、直す順番を決めたものです。1項目を1つの PR にし、機能の変更と混ぜません。終わった項目はこのファイルから消します。

## 終わったこと

段階 0〜2 は v2.36.1 から v2.36.14 で終わりました。

- 検査: `staticcheck`・`knip`・単体テストのカバレッジ、`.claude` を除いた `npm run lint`、`cn` の import の規則を CI に入れました。
- 依存: Prisma を移行専用にし、範囲内の依存を更新しました。
- 画面: 旧 `Page`／`PageContainer` を消し、200 行を超えていた画面を分けました。
- TS と Go: 上限値と CSV・TSV を `tests/fixtures` の共通の fixture で照合しています。
- CI: `verify` を Node・Go・E2E の並列ジョブに分けました。
- 文書: 実装済みの計画を `docs/superpowers/plans/archive` に移しました。

## 残っていること

設計の判断が要るので、決めてから進めます。

| # | 項目 | 決めること |
|---|---|---|
| 11 | `/api/v1`（`typle-api`）の行く末 | 使う人がいるか。iPad・Mac を GraphQL へ移すか |
| 16 | `prisma migrate` を SQL だけの移行に置き換える | 本番の移行の流れを変えてよいか |

- **#11 `/api/v1`** — `server/internal/api`（1,355 行、テスト 1,427 行）は手元の `typle-api` 専用で、Vercel には載せていません。Web は v2.14.0 から GraphQL、iPad・Mac は REST を使っています。iPad・Mac が GraphQL へ移れば REST の HTTP の包み（`server/internal/web` の各ハンドラー）を減らせます。`/api/v1` は、使う人がいるなら `api-docs` で保証する範囲を書き、いないなら消します。
- **#16 移行の道具** — `prisma migrate deploy` が本番の移行を流しています。SQL だけの移行に置き換えれば Prisma への依存がなくなりますが、本番の DB の流れを変えるので、0002 の失敗（2026-10-31）のような事故の手順を先に書いてから進めます。急ぎません。

メジャーの依存の更新（ESLint 10・TypeScript 7・`@types/node` 26・`cn` 0.5）は、1つずつ別の PR にします。範囲内の依存の更新は月に1回、1つの PR にまとめます。

## 見つかった不具合

リファクタリングの中で見つけ、動作を変えないために直していないものです。

| 場所 | 内容 |
|---|---|
| `src/plugins/formats/delimited.ts`・`server/internal/workspace/delimited.go` | 1行に複数の誤りがあるとき、TS は `input_type` を先に、Go は空欄と長さを先に検査し、返すエラーのキーが違う |
| 同上 | 単語が0個の書き出しで、TS は見出しのあとに空行が1つ付き、Go は付かない |
| `src/lib/useHandwritingPad.ts` | Enter キーに `status` の確認がなく、判定ボタンが無効でも読み取りが走る |
| `src/app/admin/stat-cards.tsx` | `toLocaleString()` がブラウザーのロケールを使い、アプリの言語の設定と合わないことがある |

## 進め方の約束

- 1 PR に1項目。機能の変更と混ぜず、バージョンはパッチを上げます（`CLAUDE.md` の Release workflow）。
- リファクタリングの PR では `tests/e2e/` と `src/messages/` を変えません。変えたくなったら動作が変わった合図です。
- 新しいファイルは 200 行以下。処理は書き換えずに移し、見つけたバグは直さずにこのファイルか Issue に記録します。
- 見た目が変わるときは、そのことを PR のタイトルに書きます。
