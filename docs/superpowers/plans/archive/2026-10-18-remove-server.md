# サーバー機能の削除 Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API・ログイン・クラウド保存・共有リンク・APIトークン・DB をすべて削除し、Typle を `localStorage` だけで動くアプリにする。

**Architecture:** 画面側を先にブラウザー保存だけにし（Task 1–2）、どこからも使われなくなったサーバー側を消す（Task 3）。そのあとデータ型から共有の項目を外し（Task 4）、翻訳を整理し（Task 5）、E2E を書き換え（Task 6）、CI・文書・バージョンを直す（Task 7）。保存形式（キー `typle-r:guest-workspace:v1`、`version: 1`、`accountId: 'guest:local'`）は変えない。

**Tech Stack:** Next.js 16.4（App Router）、React 19、next-intl、node:test（`tests/*.test.cjs`）、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-18-remove-server-design.md`

## Global Constraints

- 保存キー `typle-r:guest-workspace:v1`・形式 `version: 1`・`GUEST_ACCOUNT_ID = 'guest:local'` を変えない（端末選択のキー `typle-r:device:guest:local` も同じ）
- 新しい依存を追加しない
- 翻訳は `src/messages/{ja,en,fr,ru,zh-CN,zh-TW}` の6言語でキーをそろえる（`tests/i18n.test.cjs`）
- 各タスクの終わりに `npm run typecheck`・`npm test`・`npm run lint` が通る。E2E は Task 6 でまとめて通す
- コメントは周囲のコードに合わせて英語、UI の文言は各言語
- バージョンは `0.36.0`。PR タイトルは `feat!: API・ログイン・クラウド保存・共有リンクを削除し、ブラウザー保存だけにする（v0.36.0）`
- `docs/release-workflow.md` の順序に従う。main へ直接 push しない。手動でリリース・デプロイしない

## Review Focus

1. 以前に保存した `shared: true`・`shareId` を含むブラウザーデータ → エラーにならずに読め、次の保存で項目が消える（Task 4 のテスト）
2. 以前のログインで残った `authjs.session-token` Cookie → 無視され、ブラウザーのデータが表示される（Task 6 のテスト）
3. ブックマークされた `/shared/<id>`・`/local-login` → 404 ページになり、画面が壊れない（Task 6 のテスト）
4. スクリプトからの `/api/v1/lists`・`/api/workspace` → 404（Task 6 のテスト。デプロイ後の確認は Task 7）
5. 選択済みの端末（`typle-r:device:guest:local`）→ 変更後も同じ端末が選ばれている（既存の `tests/e2e/devices.spec.ts` が通ること。キーを変えない）

---

### Task 1: 画面をブラウザー保存だけにし、ログインの UI を削除する

**Files:**
- Modify: `src/lib/useWordLists.tsx`、`src/plugins/storage/index.ts`、`src/core/workspaceStore.ts`、`src/core/workspaceSession.ts`、`src/plugins/storage/guest.ts`
- Modify: `src/app/layout.tsx`（`AuthProvider` を外す）、`src/components/Navbar/Navbar.tsx`（`AccountBar` を外す）、`src/components/Navbar/StorageBadge.tsx`、`src/components/PageStorageBadge.tsx`、`src/components/About/StorageComparison.tsx`、`src/components/LegacyImport.tsx`
- Modify: `PageStorageBadge` を使うページ（`src/app/(workspace)/{edit,records,rankings,devices}/page.tsx`、`src/components/WordListEditor.tsx`）
- Delete: `src/components/AuthProvider.tsx`、`src/components/AccountBar.tsx`、`src/app/local-login/`
- Modify: `src/plugins/storage/cloud/client.ts`（`cloudStore` だけを削除する。共有ページが使う関数は Task 2 まで残す）
- Test: `tests/workspaceSession.test.cjs`、`tests/guestWorkspace.test.cjs`

**Interfaces:**
- Produces:
  - `WorkspaceStore` は `read`・`write`・`subscribe?` だけを持つ。`location`・`staleReads` と型 `WorkspaceLocation` を削除する
  - `workspaceStore(): WorkspaceStore` は引数なしで常に `guestStore` を返す（`src/plugins/storage/index.ts`）
  - `useWordLists()` の戻り値から `storage` を削除する。`accountId` は常に `GUEST_ACCOUNT_ID`（`string` 型、`undefined` にならない）
  - `PageStorageBadge()` と `StorageBadge({ className })` は props で保存先を受け取らず、常に「このブラウザーに保存」を表示する

- [ ] **Step 1: テストを新しい形に直す**
  - `tests/workspaceSession.test.cjs`: `fakeStore` から `location`・`staleReads` を外す。`staleReads: true` を前提にした「保存後に古い read が届いても新しい状態を保つ」テストは削除する。`staleReads: false` 側（read のほうが低い revision なら read の状態を表示する）のテストは、オプションなしの `fakeStore()` で残す
  - `tests/guestWorkspace.test.cjs`: `cloudStore` の import と、`location`・`staleReads` を比べる4行を削除する
- [ ] **Step 2: 直したテストが今のコードで通ることを確かめる**（削除のタスクなので、新しい失敗はない。残す振る舞いが今と同じであることを先に固定する）
  Run: `npm test`
  Expected: PASS（`staleReads` を渡さない `fakeStore` は今のコードで `false` と同じに動く）
- [ ] **Step 3: 実装する**
  - `workspaceSession.ts` の `load` から `store.staleReads` の分岐を削除する
  - `guest.ts` から `location`・`staleReads` を削除する
  - `useWordLists.tsx` から `useSession` を外し、`accountId = GUEST_ACCOUNT_ID` に固定する。`loaded` の `status` 判定と、`identity` によるリセットも削除する
  - `WorkspaceGate` は `accountId` が常にあるので、`Fragment key` だけを返す形のまま動く（読み込み表示の分岐は削除する）
  - `StorageBadge`・`StorageComparison` から `useSession` を外す。`StorageComparison` はブラウザーの1枚だけを表示し、`current` の印は付けない
  - `LegacyImport` から `useSession` を外す。文言は常に `thisBrowser`・`toBrowser` を使う
  - `Navbar` から `AccountBar` を外す。端末管理への導線はサイドバー（`navigation.ts` の `/devices`）にあるので、ほかの場所には追加しない
- [ ] **Step 4: 確認する**
  Run: `npm run typecheck && npm test && npm run lint`
  Expected: すべて PASS（`src/app/api`・`src/auth.ts` はまだ残っているが、画面側からは参照されない）
- [ ] **Step 5: Commit** `refactor: 画面の保存先をブラウザーだけにし、ログインのUIを削除する`

### Task 2: 共有リンクと API トークンの UI を削除する

**Files:**
- Modify: `src/components/WordLists/ListRow.tsx`（`canShare`・`onShare`・共有バッジ・共有メニュー・`shareLoginRequired` を削除）、`src/app/(workspace)/edit/page.tsx`（`ShareDialog`・`sharing` の状態・`delete.sharedNote` を削除）、`src/app/settings/page.tsx`（`ApiTokens` を外す）
- Delete: `src/components/WordLists/ShareDialog.tsx`、`src/app/(workspace)/shared/`、`src/lib/useSharedList.ts`、`src/components/Settings/ApiTokens.tsx`、`src/lib/apiTokens.ts`、`src/plugins/storage/cloud/client.ts`
- Test: `tests/sharingMessages.test.cjs`（削除）、`tests/refactoring.test.cjs`（`workspace transport validates responses and preserves conflict status` とその import を削除）

**Interfaces:**
- Consumes: Task 1 の `useWordLists()`（`storage` なし）
- Produces: `ListRow` の props は `{ item, now, highlight, disabled, canCopy, onEdit, onExport, onCopy, onDelete }`

- [ ] **Step 1: 共有・トークン・`cloud/client.ts` だけのテストを削除する**（上の Test のとおり）
- [ ] **Step 2: 実装する**（上の Files のとおり）
- [ ] **Step 3: 確認する**
  Run: `npm run typecheck && npm test && npm run lint`、`grep -rn "ShareDialog\|useSharedList\|ApiTokens\|lib/apiTokens" src` が0件
  Expected: すべて PASS
- [ ] **Step 4: Commit** `refactor: 共有リンクとAPIトークンの画面を削除する`

### Task 3: API・Auth.js・DB を削除する

**Files:**
- Delete: `src/app/api/`、`src/auth.ts`、`src/lib/localDevelopment.ts`、`src/plugins/storage/cloud/`、`src/core/apiTokens.ts`、`src/core/apiRequests.ts`、`prisma/`、`prisma.config.ts`、`scripts/migrate.cjs`、`scripts/seed.cjs`、`compose.yaml`
- Delete: `tests/apiDatabase.test.cjs`、`tests/apiRequests.test.cjs`、`tests/apiTokens.test.cjs`、`tests/databaseUrl.test.cjs`。ほかの単体テストのうち、削除したファイルを import している部分
- Modify: `package.json`・`package-lock.json`（`npm uninstall next-auth @prisma/client @prisma/adapter-pg prisma pg @types/pg` など、実際に入っているものだけ。スクリプト `db:*`・`postinstall`・`prebuild` を削除）
- Modify: `eslint.config.mjs`（`next-auth`・`@prisma/*`・`pg` と `src/app/api/**` の除外を削除）
- Modify: `src/app/layout.tsx`（`siteUrl` は `process.env.SITE_URL || VERCEL_PROJECT_PRODUCTION_URL から作る URL || 'http://localhost:3000'`。`AUTH_URL` は読まない）
- Modify: `scripts/dev-lan.cjs`（`AUTH_URL` を使わず、`LOCAL_DEVELOPMENT_LAN_HOST` のプライベート IPv4 とポート `3000` で起動）、`scripts/setup-local.cjs`（DB・Auth の値を書かない。ファイルの役目がなくなるなら削除し、README の手順も消す）、`.env.example`（DB・Auth・`LOCAL_DEVELOPMENT_LOGIN` を削除し、任意の `SITE_URL=` を追加）
- Modify: `src/sentry.server.config.ts`・`src/sentry.edge.config.ts`・`src/instrumentation.ts`（DB・API に関する記述があれば削除。ファイルは残す）

**Interfaces:**
- Produces: `src/` から `next-auth`・`@prisma`・`pg` の import がなくなる

- [ ] **Step 1: 削除する**（上の Files のとおり）
- [ ] **Step 2: 削除漏れを確かめる**
  Run: `grep -rnE "next-auth|@prisma|from 'pg'|plugins/storage/cloud|@/auth|AUTH_URL|AUTH_SECRET|DATABASE_URL" src scripts tests eslint.config.mjs package.json`
  Expected: 0件（`tests/e2e/` は Task 6 で直すので除く）
- [ ] **Step 3: 確認する**
  Run: `npm ci && npm run typecheck && npm test && npm run lint && npm run build`
  Expected: すべて PASS。`npm ci` で `prisma generate` が走らない
- [ ] **Step 4: Commit** `refactor!: API・Auth.js・DBを削除する`

### Task 4: リストのデータから共有の項目を外す

**Files:**
- Modify: `src/core/wordLists.ts`（`SavedWordList` から `shared`・`shareId` を削除。`decodeLists` は、この2つの項目があっても検証せずに捨てる）、`src/core/workspaceRequest.ts`（`stripShareIds` を使わない）
- Delete: `src/core/sharedLists.ts`、`tests/sharedLists.test.cjs`
- Test: `tests/wordLists.test.cjs`、`tests/guestWorkspace.test.cjs`

**Interfaces:**
- Produces: `SavedWordList` = `{ id, name, words, records, createdAt, ... }`（`shared`・`shareId` なし）

- [ ] **Step 1: 失敗するテストを書く**
  - `tests/wordLists.test.cjs` に `decodeLists drops sharing fields saved by older versions` を追加する。入力は `{ version: 1, lists: [{ ...valid, shared: true, shareId: 'x' }, { ...valid2, shared: 'yes' }] }`。期待値は、どちらのリストも読めて、`'shared' in list`・`'shareId' in list` が `false`
  - `tests/guestWorkspace.test.cjs` に `guest data with old sharing fields loads and the next write drops them` を追加する。`typle-r:guest-workspace:v1` に `shared: true, shareId: 'x'` を含むリストを置いて、`guestStore.read()` が成功すること。そのあと `write` し、保存された JSON に `shared`・`shareId` がないこと
- [ ] **Step 2: テストが落ちることを確かめる**
  Run: `npm test`
  Expected: FAIL（今は `shared: 'yes'` で例外になり、`shared: true` は結果に残る）
- [ ] **Step 3: 実装する**（上の Files のとおり。`decodeLists` の検証から `shared`・`shareId` の条件を外し、正規化した結果に含めない）
- [ ] **Step 4: 確認する**
  Run: `npm run typecheck && npm test && npm run lint`、`grep -rn "shareId\|\.shared\b\|sharedLists" src` が0件
  Expected: すべて PASS
- [ ] **Step 5: Commit** `refactor: リストのデータから共有の項目を外す`

### Task 5: 翻訳とエラーキーを整理する

**Files:**
- Delete: 全6言語の `account.json`・`shared.json`。`src/i18n/messages.ts` の名前空間一覧から `account`・`shared` を外す
- Modify: 全6言語の `settings.json`（API トークンのキーを削除）、`errors.json`（削除した機能だけが使うキーを削除：`invalidToken`・`insufficientScope`・`tokenLimit`・`tokenNotFound`・`invalidTokenRequest`・`loginRequired`・`loginAccountChanged`・`forbiddenRequest`・`sharedListNotFound`・`databaseUnavailable`・`workspaceSaveFailed` など。どこからも参照されないことを `grep` で確かめてから削除する）、`wordLists.json`（`share`・`sharedBadge`・`shareLoginRequired`・`delete.sharedNote`・`legacy.toAccount`・`legacy.currentAccount`）、`nav.json`（`storage.account`・`storage.accountDetail`）、`common.json`（`storage.account`・`storage.accountDetail`）、`about.json`（`places.account.*`・`places.current`）、`guide.json`・`home.json`（ログイン・クラウド・共有・API に触れる文）
- Modify: 文言の変更（日本語。ほかの言語は同じ意味に訳す）
  - `nav.storage.browserDetail`: `このブラウザーだけに保存します。ほかの端末やブラウザーとは同期しません。`
  - `common.storage.guestDetail`: 上と同じ文
- Test: `tests/i18n.test.cjs`（既存）

- [ ] **Step 1: 削除と文言の変更をする**（上の Files のとおり）
- [ ] **Step 2: 確認する**
  Run: `npm run typecheck && npm test && npm run lint`。日本語ファイルで `grep -rn "ログイン\|GitHubアカウント\|共有リンク\|APIトークン\|クラウド" src/messages/ja` が0件（`about`・`guide` で、GitHub リポジトリへのリンクの文は残してよい）
  Expected: すべて PASS
- [ ] **Step 3: Commit** `refactor: 削除した機能の翻訳とエラーキーを削除する`

### Task 6: E2E をブラウザー保存に合わせる

**Files:**
- Delete: `tests/e2e/api.spec.ts`、`tests/e2e/sharing.spec.ts`
- Modify: `tests/e2e/practice.spec.ts`。`next-auth/jwt` の Cookie と `pg` の後片付けをやめる。`seed()` は `page.addInitScript` で `typle-r:guest-workspace:v1` に `{ version: 1, accountId: 'guest:local', revision: 1, lists, devices: [] }` を書く。保存内容の確認（`GET /api/workspace`）は、`localStorage` の同じキーを読む形にする。保存の失敗（`page.route('**/api/workspace')` で 503 などを返していたもの）は、`addInitScript` で `Storage.prototype.setItem` を、そのキーのときだけ例外にする形にする。`guest.spec.ts` の `quota failure keeps draft and allows retry` と同じやり方に合わせる
  - 削除するテスト：`user menu signs out and returns to home`、`real API rejects anonymous, cross-origin, account spoofing and stale writes`、`legacy data migrates once to the authenticated database account`、`switching account refreshes the workspace without exposing the previous list`
  - それ以外のテストは残し、ブラウザー保存で同じことを確かめる
- Modify: `tests/e2e/guest.spec.ts`。`GitHub session uses a separate workspace and signing out restores guest data` を削除する。`corrupt local data remains untouched and cloud API requires authentication` は、API の `401` を確かめる2行を削除する。`/api/workspace` へのリクエストを数える処理も削除する。about のテストは「ブラウザーだけを説明する」内容に合わせる
- Modify: ログインに関わるほかの spec（`dashboard`・`devices`・`play`・`rankings`・`records`・`word-drag`・`word-lists`）の、`/api/` や `accountId` に関わる部分
- Modify: `playwright.config.ts`（`webServer.env` を削除）
- Create: `tests/e2e/removed.spec.ts`
  - `removed server routes answer 404`: `/api/workspace`・`/api/v1/lists`・`/api/tokens`・`/api/auth/session` への `GET` が `404`。`/shared/0b1c` と `/local-login` を開くと 404 ページになる
  - `a leftover session cookie is ignored`: Cookie `authjs.session-token=stale` を足して、`typle-r:guest-workspace:v1` に置いたリストが `/edit` に表示される

- [ ] **Step 1: 新しいテストを書き、spec を直す**（上の Files のとおり）
- [ ] **Step 2: 確認する**
  Run: `npm run build && npm run test:e2e`
  Expected: すべて PASS
- [ ] **Step 3: Commit** `test: E2Eをブラウザー保存だけの構成に合わせる`

### Task 7: CI・Vercel・文書・バージョンを直す

**Files:**
- Modify: `.github/workflows/ci.yml`
  - `verify`: `env.DATABASE_URL`・`services.postgres`・`npm run db:migrate` を削除する
  - `deploy` の最後のステップ（`Check production home and authentication boundary`）の名前を `Check production home and removed API` にする。`/api/workspace` の期待値を `404` にし、メッセージは `Expected removed API HTTP 404, got $status`
- Modify: `vercel.json`（`buildCommand` を `npm run build` に。`git.deploymentEnabled: false` は残す）
- Modify: `README.md`（DB・OAuth・Neon・開発ログイン・共有・API の説明を削除し、ブラウザー保存だけで動くことを書く。`dev:lan` は `LOCAL_DEVELOPMENT_LAN_HOST` だけで動くこと、端末ごとに別のデータになることを書く）
- Modify: `docs/release-workflow.md`（初回設定の5番の DB・Auth の環境変数を削除する）
- Delete: `docs/api.md`
- Modify: `package.json`・`package-lock.json`（`npm version 0.36.0 --no-git-tag-version`）

- [ ] **Step 1: 変更する**（上の Files のとおり）
- [ ] **Step 2: すべての確認を通す**
  Run: `node --test scripts/ci/release.test.cjs && npm ci && npm run typecheck && npm test && npm run lint && npm run build && npm run test:e2e`
  Expected: すべて PASS
- [ ] **Step 3: 最終の削除漏れ確認**
  Run: `grep -rnE "next-auth|@prisma|DATABASE_URL|AUTH_SECRET|/api/" src tests scripts .github vercel.json playwright.config.ts`
  Expected: `tests/e2e/removed.spec.ts` と `ci.yml` の 404 確認だけ
- [ ] **Step 4: Commit・push** `chore: CI・文書から DB と Auth を外し、v0.36.0 にする`。PR #50 の説明を、実際の変更とマージ後の外部作業（Vercel の環境変数 `DATABASE_URL` などと `AUTH_*` の削除、Neon の削除、GitHub OAuth App の削除。`SITE_URL` は任意）に合わせて更新する
