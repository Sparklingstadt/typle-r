# GitHubログインとクラウド保存を戻す Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v0.36.0 で削除した GitHub ログイン（と開発用ログイン）とアカウントのクラウド保存を、v0.35.2 と同じ動きで戻す。共有リンク・APIトークン・`/api/v1` は戻さない。

**Architecture:** v0.35.2（`df26bb9`）のファイルを `git show df26bb9:<path>` / `git checkout df26bb9 -- <path>` で取り出して戻し、共有リンクと APIトークンの部分だけを取り除く。保存の層（Task 1）→ DB（Task 2）→ 認証と API（Task 3）→ 画面と翻訳（Task 4）→ E2E（Task 5）→ CI・文書・バージョン（Task 6）の順に進める。

**Tech Stack:** Next.js 16.4、Auth.js（next-auth 5 beta）、Prisma 7.10 + `@prisma/adapter-pg`、PostgreSQL、node:test、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-19-restore-login-design.md`

## Global Constraints

- 戻すファイルは v0.35.2（`df26bb9`）の版を基にする。書き直さない
- `prisma/migrations/0001`〜`0007` と `migration_lock.toml` は `df26bb9` の版と**1バイトも変えない**（適用済みのチェックサム）
- 共有リンク・APIトークン・`/api/v1`・`/api/tokens`・`/api/shared`・`/shared/[id]`・`docs/api.md` は戻さない
- 以前の `shared`・`shareId` は読み込み時に捨てる（`src/core/wordLists.ts` の `decodeLists` の処理は v0.36.0 のまま）
- 翻訳は6言語（ja・en・fr・ru・zh-CN・zh-TW）でキーをそろえる
- バージョンは `0.38.0`、PR タイトル `feat: GitHubログインとクラウド保存を戻す（v0.38.0）`
- `docs/release-workflow.md` の順序に従う。main へ直接 push しない
- 各タスクの終わりに `npm run typecheck`・`npm test`・`npm run lint` が通る（Task 2 以降は `DATABASE_URL` をローカルの PostgreSQL に向けて実行する）

## Review Focus

1. クラウドに残る `shared: true`・`shareId` 付きのリスト → 読み込みでエラーにならず、項目は捨てられ、次の保存で DB からも消える（Task 1・Task 2 のテスト）
2. v0.36.0 の間にブラウザーへ保存したデータ → ログインしていなければそのまま表示され、ログインしても消えない（Task 5 の `guest.spec.ts`）
3. 本番の DB に 0008 を適用するとき、`typle_shared_lists`・`typle_api_tokens` がすでにない環境（新しいローカル DB など）→ `DROP TABLE IF EXISTS` で失敗しない（Task 2 で、空の DB に 0001〜0008 を適用して確かめる）
4. v0.36.0 の画面を開いたままのタブ → ログイン後のリロードでアカウントの保存先に切り替わる（`/api/auth/session` が戻るだけで、既存の切り替え処理が担う。Task 5 の `account.spec.ts` のアカウント切り替えのテストで確かめる）
5. `/api/v1/lists`・`/api/tokens`・`/shared/<id>` → 404 のまま（Task 5 の `removed.spec.ts`）

---

### Task 1: 保存の層を戻す（クラウドとブラウザーの切り替え）

**Files:**
- Modify: `src/core/workspaceStore.ts`、`src/core/workspaceSession.ts`、`src/plugins/storage/guest.ts`、`src/plugins/storage/index.ts`（すべて `df26bb9` の版に戻す）
- Create: `src/plugins/storage/cloud/client.ts`（`df26bb9` の版から `readSharedList` と `decodeSharedList` の import を除く）、`src/plugins/storage/cloud/databaseUrl.ts`（`df26bb9` の版）
- Modify: `src/lib/useWordLists.tsx` のうち `workspaceStore(accountId)` の呼び出しと `storage` の返却だけを `df26bb9` の版に戻す（`useSession` は Task 4）
- Test: `tests/workspaceSession.test.cjs`、`tests/guestWorkspace.test.cjs`、`tests/refactoring.test.cjs`（それぞれ `df26bb9` の版に戻す）、`tests/databaseUrl.test.cjs`（`df26bb9` の版）

**Interfaces:**
- Produces:
  - `WorkspaceStore` に `location: WorkspaceLocation`（`'browser' | 'account'`）と `staleReads: boolean`
  - `workspaceStore(accountId: string): WorkspaceStore`（`GUEST_ACCOUNT_ID` なら `guestStore`、それ以外は `cloudStore`）
  - `cloudStore`・`readWorkspace()`・`writeWorkspace(request)`（`client.ts`）

- [ ] **Step 1: テストを `df26bb9` の版に戻し、クラウドの共有項目のテストを足す**
  - `git checkout df26bb9 -- tests/workspaceSession.test.cjs tests/guestWorkspace.test.cjs tests/refactoring.test.cjs tests/databaseUrl.test.cjs`
  - `tests/guestWorkspace.test.cjs` の末尾に、v0.36.0 で追加した `guest data with old sharing fields loads and the next write drops them` を残す（`git show 0ff7d52:tests/guestWorkspace.test.cjs` から写す）
  - `tests/refactoring.test.cjs` に `cloud reads drop sharing fields saved by older versions` を追加する。`fetch` をモックして `{ accountId: 'github:1', revision: 1, devices: [], lists: [{ ...list, shared: true, shareId: 'x' }] }` を返し、`readWorkspace()` の `lists[0]` に `'shared' in` と `'shareId' in` がどちらも `false`
- [ ] **Step 2: 失敗することを確かめる**
  Run: `npm test`
  Expected: FAIL（`cloud/client.ts` がない、`workspaceStore('github:1')` が `cloudStore` にならない、`location`・`staleReads` がない）
- [ ] **Step 3: 実装する**（上の Files のとおり）
- [ ] **Step 4: 確かめる**
  Run: `npm run typecheck && npm test && npm run lint`
  Expected: すべて PASS
- [ ] **Step 5: Commit** `feat: クラウドとブラウザーの保存先の切り替えを戻す`

### Task 2: DB を戻し、共有リンクと APIトークンのテーブルを削除する

**Files:**
- Restore（`git checkout df26bb9 -- ...`）: `prisma.config.ts`、`prisma/baseline.prisma`、`prisma/migrations/0001_workspaces`〜`0007_drop_profile_columns`、`prisma/migrations/migration_lock.toml`、`scripts/migrate.cjs`、`scripts/seed.cjs`、`scripts/setup-local.cjs`、`compose.yaml`
- Create: `prisma/schema.prisma`（`df26bb9` の版から `SharedList`・`ApiToken` のモデルを除く）
- Create: `prisma/migrations/0008_drop_shared_lists_and_api_tokens/migration.sql`
  ```sql
  -- Share links and API tokens were removed in v0.36.0; their tables are no longer used.
  DROP TABLE IF EXISTS "typle_shared_lists";
  DROP TABLE IF EXISTS "typle_api_tokens";
  ```
- Create: `src/plugins/storage/cloud/database.ts`（`df26bb9` の版から `tokenStore` と `tokens` の import を除く）
- Create: `src/plugins/storage/cloud/repository.ts`（`df26bb9` の版から `syncShared`・`shareRows`・`sharedContent`・`readShared`・`modify`・`MAX_API_LISTS_BYTES`・`listBytes` と、`sharedLists` の import を除く。`view(document, revision)` は `{ lists, devices, revision }` を返す）
- Modify: `package.json`・`package-lock.json`（`df26bb9` の `@prisma/adapter-pg`・`@prisma/client`・`pg`・`@types/pg`・`prisma` と同じ版を `npm install` で入れる。scripts の `db:*`・`postinstall`・`prebuild` と `overrides` を `df26bb9` の版に戻す）
- Test: `tests/workspace.test.cjs` に `df26bb9` の `Prisma repository isolates owners and atomically rejects stale revisions` と `devices sync per owner, survive older clients, and share revision conflicts` と、その import・ヘルパーを戻す（共有リンクの2テストは戻さない）

**Interfaces:**
- Produces: `database(): { read(ownerId): Promise<Workspace>; write(ownerId, revision, change): Promise<Workspace | null> }`（`src/plugins/storage/cloud/database.ts`）

- [ ] **Step 1: ローカルの PostgreSQL を用意する**（作業環境の準備で、コミットしない）
  `/usr/lib/postgresql/16/bin` の `initdb`・`pg_ctl` を root 以外のユーザーで実行し、`127.0.0.1:5432` にユーザー `typle`・DB `typle` を作る。以降のコマンドは `DATABASE_URL=postgresql://typle:<password>@127.0.0.1:5432/typle` を付けて実行する
- [ ] **Step 2: テストを戻す**（上の Test のとおり）
- [ ] **Step 3: 失敗することを確かめる**
  Run: `npm test`
  Expected: FAIL（`cloud/repository.ts` と `@prisma/client` がない）
- [ ] **Step 4: 実装する**（上の Files のとおり）
- [ ] **Step 5: 空の DB にマイグレーションを適用する**
  Run: `npm run db:migrate`
  Expected: `0001`〜`0008` が適用される。`psql` で `\dt` に `typle_workspaces` だけがあり、`typle_shared_lists`・`typle_api_tokens` がない
- [ ] **Step 6: 確かめる**
  Run: `npm run typecheck && npm test && npm run lint`、`git diff df26bb9 -- prisma/migrations/0001_workspaces prisma/migrations/0002_practice_devices prisma/migrations/0003_profiles prisma/migrations/0004_shared_lists prisma/migrations/0005_api_tokens prisma/migrations/0006_merge_profiles prisma/migrations/0007_drop_profile_columns prisma/migrations/migration_lock.toml`
  Expected: すべて PASS。マイグレーションの diff は空
- [ ] **Step 7: Commit** `feat: DBを戻し、使わなくなった共有リンクとAPIトークンのテーブルを削除する`

### Task 3: 認証と `/api/workspace` を戻す

**Files:**
- Restore（`git checkout df26bb9 -- ...`）: `src/auth.ts`、`src/app/api/auth/[...nextauth]/route.ts`、`src/app/api/_lib/session.ts`、`src/app/api/workspace/route.ts`、`src/lib/localDevelopment.ts`、`src/app/local-login/`
- Modify: `package.json`・`package-lock.json`（`df26bb9` と同じ版の `next-auth` を `npm install` で入れる）
- Modify: `eslint.config.mjs`（`frameworks` と `src/plugins/**` の group に `next-auth`・`next-auth/*`、`frameworks` に `@prisma/*`・`pg` を戻す。画面のルールの `ignores: ['src/app/api/**']` と、メッセージ `Screens get the workspace and where it is saved from useWordLists, not from a storage plugin.` を戻す）
- Modify: `scripts/dev-lan.cjs`・`.env.example`（`df26bb9` の版に戻し、`.env.example` に任意の `SITE_URL=` とその説明行を残す）
- Modify: `src/app/layout.tsx` の `siteUrl` を `process.env.SITE_URL || process.env.AUTH_URL || (VERCEL_PROJECT_PRODUCTION_URL から作る URL) || "http://localhost:3000"`
- Test: `tests/countries.test.cjs` に `df26bb9` の `local login requires explicit development opt-in, secret and loopback URL` と `LAN login only permits an explicitly selected private IPv4 in development` と import を戻す

**Interfaces:**
- Consumes: Task 2 の `database()`
- Produces: `auth`・`signIn`・`signOut`・`handlers`（`src/auth.ts`）、`sessionOwner(): Promise<string | null>`・`sameOrigin(request): boolean`（`src/app/api/_lib/session.ts`）

- [ ] **Step 1: テストを戻す**（上の Test のとおり）
- [ ] **Step 2: 失敗することを確かめる**
  Run: `npm test`
  Expected: FAIL（`src/lib/localDevelopment.ts` がない）
- [ ] **Step 3: 実装する**（上の Files のとおり）
- [ ] **Step 4: 確かめる**
  Run: `npm run typecheck && npm test && npm run lint && npm run build`
  Expected: すべて PASS。ビルドの一覧に `/api/auth/[...nextauth]`・`/api/workspace`・`/local-login` があり、`/api/v1`・`/api/tokens`・`/api/shared`・`/shared` がない
- [ ] **Step 5: Commit** `feat: GitHubログイン・開発用ログインと/api/workspaceを戻す`

### Task 4: 画面と翻訳を戻す

**Files:**
- Restore（`git checkout df26bb9 -- ...`）: `src/components/AuthProvider.tsx`、`src/components/AccountBar.tsx`、`src/components/Navbar/Navbar.tsx`、`src/components/Navbar/StorageBadge.tsx`、`src/components/PageStorageBadge.tsx`、`src/components/About/StorageComparison.tsx`、`src/components/LegacyImport.tsx`、`src/components/WorkspaceGate.tsx`、`src/components/Dashboard/Dashboard.tsx`、`src/components/WordListEditor.tsx`、`src/app/guide/page.tsx`、`src/app/home/page.tsx`、`src/app/(workspace)/create/page.tsx`・`devices/page.tsx`・`rankings/page.tsx`・`records/page.tsx`、`src/lib/useWordLists.tsx`、`src/messages/*/account.json`
- Modify: `src/app/layout.tsx`（`AuthProvider` を戻す。Task 3 の `siteUrl` は残す）
- Modify: `src/app/(workspace)/edit/page.tsx`（`storage` を受け取って `Header`・`WordListEditor`・`ListManager` に渡す部分だけ戻す。`ShareDialog`・`canShare`・`onShare`・`sharing`・`delete.sharedNote` は戻さない）
- Modify: `src/i18n/messages.ts`・`src/i18n/messageTypes.ts`（`account` を戻す。`shared` は戻さない）
- Modify: 6言語の `about`・`common`・`dashboard`・`errors`・`guide`・`home`・`nav`・`practice`・`wordLists`（`df26bb9` の版に戻したうえで、次のキーを除く）
  - `errors`: `sharedListNotFound`・`invalidToken`・`insufficientScope`・`unsupportedContentType`・`invalidJson`・`invalidQuery`・`listNotFound`・`deviceNotFound`・`invalidRecord`・`invalidTokenRequest`・`tokenLimit`・`tokenNotFound`
  - `wordLists`: `delete.sharedNote`・`row.share`・`row.shareLoginRequired`・`row.sharedBadge`・`share`
- `settings`・`src/app/settings/page.tsx`・`ListRow.tsx` は v0.36.0 のまま（APIトークンと共有は戻さない）
- Test: `tests/i18n.test.cjs`（既存）

**Interfaces:**
- Consumes: Task 1 の `workspaceStore(accountId)`・`location`、Task 3 の `next-auth/react`
- Produces: `useWordLists()` が `storage: WorkspaceLocation | undefined` と、ログイン中は `accountId: 'github:<id>'` を返す

- [ ] **Step 1: 実装する**（上の Files のとおり）
- [ ] **Step 2: 確かめる**
  Run: `npm run typecheck && npm test && npm run lint`。`grep -rn "ShareDialog\|useSharedList\|ApiTokens\|readSharedList\|tokenStore" src` が0件。日本語の翻訳で `grep -rn "共有リンク\|APIトークン" src/messages/ja` が0件
  Expected: すべて PASS
- [ ] **Step 3: Commit** `feat: ログインと保存先の画面・翻訳を戻す`

### Task 5: E2E を戻す

**Files:**
- Restore: `tests/e2e/guest.spec.ts`（`df26bb9` の版。GitHub のセッションでは別の保存先になりログアウトで戻るテスト、`/api/workspace` の 401、About の2つの保存先の比較を含む）
- Create: `tests/e2e/account.spec.ts`。`df26bb9` の `tests/e2e/practice.spec.ts` から、先頭の設定（`next-auth/jwt` の `encode` で作るセッション Cookie、`pg` での後片付け、API での `seed`）と、次の4テストを写す: `user menu signs out and returns to home`・`real API rejects anonymous, cross-origin, account spoofing and stale writes`・`legacy data migrates once to the authenticated database account`・`switching account refreshes the workspace without exposing the previous list`
- Modify: `tests/e2e/practice.spec.ts`（ブラウザー保存のまま残す。戻した画面の文言と合わない期待値だけを直す）
- Modify: `tests/e2e/removed.spec.ts`（`removed server routes answer 404` は `/api/v1/lists`・`/api/tokens` と `/shared/0b1c` だけを確かめる。`a leftover session cookie is ignored` は削除する）
- Modify: `playwright.config.ts`（`webServer.env` に `AUTH_SECRET: 'typle-e2e-only-not-a-production-secret-32-bytes'`・`AUTH_URL: 'http://127.0.0.1:3101'` を戻す）

- [ ] **Step 1: 実装する**（上の Files のとおり）
- [ ] **Step 2: 確かめる**
  Run: `DATABASE_URL=... npm run db:migrate && npm run build && npm run test:e2e`（この環境の Chromium が古い場合は、コミットしない一時設定で `/opt/pw-browsers/chromium` を使う）
  Expected: すべて PASS。v0.36.0 で環境が原因と判断した2件（日本語のファイル名のダウンロード）は同じ理由でのみ失敗してよい
- [ ] **Step 3: Commit** `test: ログインとクラウド保存のE2Eを戻す`

### Task 6: CI・Vercel・文書・バージョン

**Files:**
- Modify: `.github/workflows/ci.yml`（`df26bb9` の版の `verify` の `env.DATABASE_URL`・`services.postgres`・`npm run db:migrate` と、`deploy` の最後のステップ `Check production home and authentication boundary`（`/api/workspace` が `401`）に戻す。それ以外は今のまま）
- Modify: `vercel.json`（`buildCommand` を `npm run db:migrate && npm run build`）
- Modify: `README.md`・`docs/release-workflow.md`・`docs/sentry.md`（ログインとクラウド保存・Neon・Docker・OAuth・マイグレーションの説明を `df26bb9` の内容に戻す。共有リンク・Typle API・APIトークンの節と言及は戻さない。README の先頭近くに v0.38.0 の節を追加し、ログインとクラウド保存を戻したこと、共有リンク・APIトークン・Typle API は戻していないこと、0008 で2つのテーブルを削除したことを書く。`SITE_URL` の説明は残す）
- Modify: `package.json`・`package-lock.json`（`npm version 0.38.0 --no-git-tag-version`）

- [ ] **Step 1: 変更する**（上の Files のとおり）
- [ ] **Step 2: すべての確認を通す**
  Run: `node --test scripts/ci/release.test.cjs && npm ci && DATABASE_URL=... npm run db:migrate && npm run typecheck && npm test && npm run lint && npm run build && npm run test:e2e`
  Expected: すべて PASS（E2E は Task 5 と同じ扱い）
- [ ] **Step 3: 戻し漏れと戻しすぎの確認**
  Run: `grep -rnE "api/v1|api/tokens|api/shared|sharedLists|ShareDialog|ApiTokens|tokenStore|typle_shared_lists|typle_api_tokens" src tests scripts .github README.md docs/release-workflow.md docs/sentry.md`
  Expected: `prisma/migrations` 以外では、`removed.spec.ts` の 404 確認と README の v0.38.0 の節だけ
- [ ] **Step 4: Commit・push** `chore: CI・文書にDBとログインを戻し、v0.37.0にする`。PR #51 の説明を実際の変更に合わせて更新する
