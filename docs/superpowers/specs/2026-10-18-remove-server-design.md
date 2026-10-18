# サーバー機能の削除（ブラウザー保存だけのアプリにする）設計

- 日付: 2026-10-18
- 対象バージョン: v0.36.0（破壊的変更）

## 目的

API・GitHubログイン・クラウド保存・共有リンク・APIトークン・DBをすべて削除し、Typle をブラウザー（`localStorage`）だけで動くアプリにする。サーバー側の運用（Neon・Auth・トークン管理）をなくし、構成を単純にする。

## 背景と決定事項

| 項目 | 決定 |
|---|---|
| 経緯 | 当初は API の Go への書き直しを検討したが、取りやめてサーバー機能ごと削除する |
| ログイン | Auth.js（GitHub・ローカル開発用ログイン）も削除する。ログインで使える機能が残らないため |
| 既存のクラウドデータ | 利用者は所有者本人だけなので、ブラウザーへの移行機能は作らない。DB上のデータは、外部の後片付けで所有者が削除する |
| ブラウザーのデータ | 保存キー `typle-r:guest-workspace:v1`・形式 `version: 1`・アカウントID `guest:local` は変えない。既存データはそのまま読める |
| 共有リンクの代わり | 既存の単語リストのファイル書き出し・読み込みを使う。新しい機能は作らない |
| 外部サービス | Neon・Vercelの環境変数・GitHub OAuth App の削除は、このリポジトリの変更に含めない。マージ後に所有者が行う |

## 削除するもの

| 区分 | 対象 |
|---|---|
| APIルート | `src/app/api/` 全体（`auth`・`v1`・`workspace`・`tokens`・`shared`・`_lib`） |
| ログイン | `src/auth.ts`、`src/app/local-login/`、`src/lib/localDevelopment.ts`（ログイン以外で使っていなければ）、`next-auth` 依存、`SessionProvider`、`AccountBar`・`StorageBadge` のアカウント表示とログイン・ログアウト操作 |
| クラウド保存 | `src/plugins/storage/cloud/` 全体。`src/plugins/storage/index.ts` は常にブラウザー保存を返す（または呼び出し側が `guestStore` を直接使う） |
| 共有リンク | `src/components/WordLists/ShareDialog.tsx`、`src/app/(workspace)/shared/[id]/`、`src/lib/useSharedList.ts`、`src/core/sharedLists.ts`、リスト行・編集画面の共有の操作と表示 |
| APIトークン | `src/components/Settings/ApiTokens.tsx`、`src/lib/apiTokens.ts`、`src/core/apiTokens.ts`、`src/core/apiRequests.ts` |
| サーバーだけの core | `src/core/workspaceRequest.ts` などのうち、ブラウザー保存が使わなくなる部分（使っている部分は残す） |
| DB | `prisma/`、`prisma.config.ts`、`@prisma/client`・`@prisma/adapter-pg`・`prisma`・`pg`（と型）、`scripts/migrate.cjs`・`scripts/seed.cjs`、`compose.yaml`、npm スクリプトの `db:*`・`postinstall`・`prebuild` |
| 文書 | `docs/api.md`。README・About・ガイド・`docs/release-workflow.md` のうち、ログイン・クラウド保存・共有・API・DB・Auth に触れる部分 |
| テスト | `tests/apiDatabase`・`apiRequests`・`apiTokens`・`sharedLists`・`sharingMessages` など削除機能だけの単体テスト、E2E の `api.spec.ts`・`sharing.spec.ts`、その他テストのログイン・DB・共有に関わる部分 |
| 翻訳 | 削除した画面・エラーだけが使っていた翻訳キー（全言語） |

## 残すもの

- 練習・単語リストの作成と編集・記録・ランキング・ダッシュボード・端末・テーマ・多言語・ガイドなど、ブラウザー内で完結する機能
- 単語リストのファイル書き出し・読み込み
- 旧形式の取り込み（`LegacyImport`）。取り込み先は常に「このブラウザー」になる
- Sentry。ページ描画のエラーを報告するため、サーバー側の `instrumentation.ts`・`sentry.server.config.ts`・`sentry.edge.config.ts` も残す。DB・API に関わる記述があれば取り除く
- GitHub Actions の `policy → verify → release → deploy` と Vercel への公開

## データ互換

- 保存済みのブラウザーデータにある `shared`・`shareId` など、使わなくなったフィールドは、読み込み時にエラーにせず捨てる。次の保存で消える
- `shared: true` を含む保存データを読み込めて、画面が普通に動くことを単体テストで確かめる

## CI・デプロイ

- `.github/workflows/ci.yml`
  - `verify`: PostgreSQL のサービス・`DATABASE_URL`・`npm run db:migrate` を削除する。型チェック・単体テスト・Lint・ビルド・E2E は残す
  - `deploy`: 公開後の確認を「`/home` が表示できる」「`/api/workspace` が `404`」に変える
  - `policy`・`release` は変えない
- `vercel.json`: `buildCommand` を `npm run build` にする。`git.deploymentEnabled: false` は残す
- `playwright.config.ts`: `webServer.env` の `AUTH_SECRET`・`AUTH_URL` を削除する
- `docs/release-workflow.md`: 初回設定の DB・Auth の環境変数の手順を削除する

## テスト方針

- 残る単体テストと E2E はすべて合格させる。構成を検査するテスト（`refactoring.test.cjs` など）は新しい構成に合わせる
- PR の前に、ローカルで `npm run typecheck`・`npm test`・`npm run lint`・`npm run build`・`npm run test:e2e` を通す
- 削除漏れの確認として、`src/` に `next-auth`・`@prisma`・`/api/` への参照が残っていないことを検索で確かめる

## バージョンとリリース

- `npm version 0.36.0 --no-git-tag-version`（`package.json`・`package-lock.json`）
- PR タイトル: `feat!: API・ログイン・クラウド保存・共有リンクを削除し、ブラウザー保存だけにする（v0.36.0）`
- `docs/release-workflow.md` の順序（PR → squash merge → マージ後の verify → GitHub Release → Vercel 本番デプロイ）に従う

## マージ後の外部の後片付け（所有者が行う）

1. Vercel 本番の環境変数から DB 接続（`DATABASE_URL` など）・`AUTH_SECRET`・`AUTH_URL`・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET` を削除する
2. Neon のデータベース（またはプロジェクト）を削除する
3. GitHub の OAuth App を削除する

## 範囲外

- クラウドデータのブラウザーへの移行
- 共有リンクの代わりになる新機能
- Go などによるバックエンドの再構築
