# GitHubログインとクラウド保存を戻す 設計

- 日付: 2026-10-19
- 対象バージョン: v0.38.0（機能追加）
- 前提: v0.36.0（`docs/superpowers/specs/2026-10-18-remove-server-design.md`）でサーバー機能をすべて削除した

## 目的

v0.36.0 で削除した GitHub ログイン（Auth.js）とアカウントのクラウド保存を、v0.35.2 と同じ動きで戻す。ログインするとアカウント（Neon）に保存し、ログインしていなければこのブラウザーに保存する。Neon に残っている以前のデータが、ログインすればまた見えるようにする。

## 決定事項

| 項目 | 決定 |
|---|---|
| 戻す範囲 | GitHubログイン、開発用ログイン（`/local-login`）、クラウド保存（`/api/workspace`）と、それに関わる画面・翻訳・テスト・文書 |
| 戻さない範囲 | 共有リンク（`/shared/[id]`・`/api/shared`）、APIトークン（`/api/tokens`・設定画面）、Typle API（`/api/v1`）、`docs/api.md` |
| 方法 | v0.35.2（`df26bb9`）のファイルを取り出して戻し、共有リンクと APIトークンに関わる部分だけを取り除く。書き直しや v0.36.0 の revert はしない |
| 振る舞い | 画面と `/api/workspace` の応答は v0.35.2 と同じ。ブラウザー保存のデータはそのまま使え、ブラウザーとアカウントのデータは別々のまま |
| DB | `typle_workspaces` はそのまま。使わなくなった `typle_shared_lists` と `typle_api_tokens` はマイグレーション 0008 で削除する |
| バージョン | `0.38.0`。PR タイトル `feat: GitHubログインとクラウド保存を戻す（v0.38.0）` |

## 戻すもの（v0.35.2 から）

| 区分 | 対象 |
|---|---|
| ログイン | `src/auth.ts`（GitHub と開発用ログイン）、`src/app/api/auth/[...nextauth]/route.ts`、`src/components/AuthProvider.tsx`、`src/components/AccountBar.tsx`、`src/app/local-login/`、`src/lib/localDevelopment.ts`、`next-auth` 依存 |
| クラウド保存 | `src/app/api/workspace/route.ts`、`src/app/api/_lib/session.ts`、`src/plugins/storage/cloud/` の `client.ts`・`database.ts`・`databaseUrl.ts`・`repository.ts` |
| 保存先の切り替え | `workspaceStore(accountId)` によるクラウド／ブラウザーの選択、`WorkspaceStore` の `location`・`staleReads`、`useWordLists` の `storage` と `useSession`、`WorkspaceGate`、保存先バッジ（`StorageBadge`・`PageStorageBadge`）のアカウント表示、About の保存先比較（`StorageComparison`）、旧形式の取り込み（`LegacyImport`）のアカウント向け表示、ダッシュボードの集計元の表示 |
| 画面の配置 | `layout.tsx` の `AuthProvider`、`Navbar` の `AccountBar` |
| 翻訳 | `account` 名前空間、`nav.storage`・`common.storage`・`about`・`guide`・`home`・`dashboard`・`wordLists.legacy`・`errors` のログインとクラウド保存に関わる文言（6言語、v0.35.2 の文） |
| DB とスクリプト | `prisma.config.ts`、`prisma/schema.prisma`、`prisma/baseline.prisma`、`prisma/migrations/0001`〜`0007` と `migration_lock.toml`（中身を一切変えない）、`scripts/migrate.cjs`・`seed.cjs`・`setup-local.cjs`、`compose.yaml`、依存（`@prisma/client`・`@prisma/adapter-pg`・`prisma`・`pg`・`@types/pg`）、npm スクリプト `db:*`・`postinstall`・`prebuild`、Prisma 向けの overrides |
| 設定 | `.env.example`、`scripts/dev-lan.cjs`、`eslint.config.mjs` の `next-auth`・`@prisma/*`・`pg` と `src/app/api/**` の扱い |

## 戻すときに取り除く部分

- `repository.ts`: 共有リンクの同期（`syncShared`・`shareRows`・`sharedContent`）、`readShared`、`view` での `shareId` の付与。保存は `typle_workspaces` だけを読み書きする
- `client.ts`: `readSharedList`
- `database.ts`: `tokenStore`
- Prisma スキーマ: `SharedList` と `ApiToken` のモデル
- `/api/workspace`・翻訳・画面: 共有リンク・APIトークンに関わる分岐と文言
- `eslint.config.mjs`: `src/app/api/**` のうち削除したルートへの言及

## データ

- クラウドの保存形式（`typle_workspaces` の `lists`・`devices`・`revision`）は変えない
- 以前の `shared`・`shareId` は、ブラウザーでもクラウドでも読み込み時に捨てる（v0.36.0 の `decodeLists` の処理を残す）。クラウドに残る `shared: true` は、次の保存で消える
- マイグレーション `0008_drop_shared_lists_and_api_tokens`: `typle_shared_lists` と `typle_api_tokens` を `DROP TABLE IF EXISTS` で削除する。元に戻せない。v0.36.0 はDBを使わないため、切り替え中に影響はない

## CI・デプロイ

- `.github/workflows/ci.yml`
  - `verify`: PostgreSQL のサービス・`DATABASE_URL`・`npm run db:migrate` を戻す
  - `deploy`: 公開後の確認を「`/home` が表示できる」「`/api/workspace` が `401`」に戻す（名前は `Check production home and authentication boundary`）
- `vercel.json`: `buildCommand` を `npm run db:migrate && npm run build` に戻す
- `playwright.config.ts`: `webServer.env` の `AUTH_SECRET`・`AUTH_URL` を戻す
- 共有画像の絶対URLは `SITE_URL || AUTH_URL || VERCEL_PROJECT_PRODUCTION_URL || http://localhost:3000`

## テスト

- 単体テスト: v0.35.2 のテストのうち、ログインとクラウド保存に関わるものを戻す（Prisma リポジトリの所有者の分離と revision 競合、端末の同期、`databaseUrl`、開発用ログインの判定、クラウド通信の検証と 409、保存先の選択、古いクラウド読み込みの無視）。共有リンク・APIトークンのテストは戻さない
- 追加: クラウドから届いた `shared`・`shareId` 付きのリストが捨てられること（`cloud/client.ts` の読み込み）
- E2E: ログイン状態のテストを `tests/e2e/account.spec.ts` にまとめて戻す（アカウントメニューとログアウト、`/api/workspace` の 401・403・409、旧形式データのアカウントへの移行、アカウントの切り替え、GitHub セッションでは別の保存先になりログアウトでブラウザーのデータに戻ること）。ブラウザー保存で書き直した既存の spec はそのまま残す
- `tests/e2e/removed.spec.ts`: `/api/v1/lists`・`/api/tokens`・`/shared/<id>` が 404 になることだけを確かめる
- PR の前に、ローカルで PostgreSQL を使って `db:migrate`・`typecheck`・`test`・`lint`・`build`・`test:e2e` を通す

## 文書

- README・`docs/release-workflow.md`・`docs/sentry.md`: ログインとクラウド保存、Neon・Docker・OAuth の設定、マイグレーションの説明を v0.35.2 の内容に戻す。共有リンク・Typle API・APIトークンの説明は戻さない。v0.38.0 の節で、戻したことと戻さなかったものを書く

## 環境変数・外部サービス（所有者）

- Vercel の `AUTH_SECRET`・`AUTH_URL`・`AUTH_GITHUB_ID`・`AUTH_GITHUB_SECRET` と、Neon の連携が作った変数は消さない（v0.38.0 で使う）
- GitHub の OAuth App と Neon のデータベースも残す

## 範囲外

- 共有リンク・APIトークン・Typle API の復活
- 認証方式やクラウド保存の仕組みの変更
- ブラウザーとアカウントのデータの自動統合
