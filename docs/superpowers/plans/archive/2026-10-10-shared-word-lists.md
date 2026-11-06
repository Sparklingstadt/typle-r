# 単語リストのリンク共有 Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインユーザーが単語リストの共有を ON/OFF でき、`/shared/<shareId>` を開いた人（未ログイン可）がそのリストを独立したコピーとして自分のリストに追加できるようにする。

**Architecture:** ワークスペースのリストに `shared?: true` を持たせ、共有の実体は新テーブル `typle_shared_lists`（主キーはサーバー発行の UUID）に置く。クラウドの保存処理が同じトランザクションで共有テーブルを同期し、応答のリストに `shareId` を付ける。公開 API `GET /api/shared/[id]` は共有テーブルだけを読み、`/shared/[id]` ページが `useWordLists().update` で今の保存先にコピーする。

**Tech Stack:** Next.js 16.4（App Router）、React 19、TypeScript、Prisma 7 + PostgreSQL、next-intl、Playwright、`node --test`（`tests/*.test.cjs` + `tests/register.cjs`）

**Spec:** `docs/superpowers/specs/2026-10-10-shared-word-lists-design.md`

## Global Constraints

- 書く前に `node_modules/next/dist/docs/` の該当ガイド（Route Handler の動的 `params`、動的ルートのページ）を読む（AGENTS.md）。
- `src/core`・`src/plugins` は React・Next.js・ブラウザー API に依存しない。画面は保存先プラグインを直接 import しない（`eslint.config.mjs` が検査）。
- 画面の文言はコードに書かず、6言語（`ja`・`en`・`zh-CN`・`zh-TW`・`ru`・`fr`）の `src/messages/<言語>/*.json` に同じキーで入れる。アポストロフィは `’`。`ja` が型の基準。
- エラーは `AppError(<errors のキー>)`。新しいキーは `errors.json` の6言語に追加する。
- 共有 id はサーバーだけが発行する。クライアントが送った `shareId` は保存しない。
- 公開 API は `{ name, words, updatedAt }` だけを返す。持ち主・プロフィール・リスト id・記録は返さない。
- マイグレーションは旧アプリと互換（テーブル追加のみ）。
- バージョンは `npm version 0.31.0 --no-git-tag-version`（package.json と package-lock.json の両方）。
- 各コミットの末尾に次の2行を付ける:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01HbVbF1qpmuEnKDCWB9xEgh`
- DB テストと E2E には PostgreSQL と `DATABASE_URL` が必要。最初に `npm ci` と `npm run db:migrate` を行う。

## Review Focus

1. **編集画面で保存しても共有が外れない** — 共有中のリストを編集画面で保存（名前・単語の変更）しても `shared` が残り、リンク先が新しい内容になる。→ Task 1 の `saveList` テストと Task 2 の「編集で更新」テスト。
2. **初回保存前の初期リストを共有する** — revision 0（サンプル表示中）に共有を ON にすると、初期リストがワークスペースに保存され、同時に共有行ができる。→ Task 2 のテスト `revision 0 で共有 ON`。
3. **他のアカウントの共有 id を送る** — クライアントが他人の `shareId` を付けて保存しても、他人の共有行は変わらず、自分の行は新しい UUID になる。→ Task 2 のテスト `送られた shareId を無視`。
4. **同じ共有リストを2回コピーする／名前が重複する** — 2件目は `copyName` の番号付きの名前で別のリストになる。→ Task 1 の `copySharedList` テスト。
5. **共有 OFF 後に古いタブでリンクを開く** — 404 と「共有されていないか、削除されました」の表示になる。→ Task 6 の E2E。

---

## File Structure

| ファイル | 役割 |
|---|---|
| `src/core/wordLists.ts`（変更） | `WordList` に `shared`・`shareId`、検証、`saveList` で `shared` を保持 |
| `src/core/listOverview.ts`（変更） | `duplicateList` が `shared` を付けない |
| `src/core/sharedLists.ts`（新規） | `SharedListContent` 型、`isShareId`、`decodeSharedList`、`copySharedList`、`sharedKeys` |
| `src/core/workspaceRequest.ts`（変更） | `validateLists` が `shareId` を取り除く |
| `prisma/schema.prisma`・`prisma/migrations/0004_shared_lists/migration.sql`（新規） | 共有テーブル |
| `src/plugins/storage/cloud/repository.ts`（変更） | 保存時の同期、応答への `shareId` 付与、`readShared` |
| `src/app/api/shared/[id]/route.ts`（新規） | 公開 API |
| `src/plugins/storage/cloud/client.ts`（変更） | `readSharedList(id)`（ブラウザーから公開 API を呼ぶ） |
| `src/lib/useSharedList.ts`（新規） | 画面用フック。プラグインを画面から直接 import しないための窓口 |
| `src/components/WordLists/ShareDialog.tsx`（新規） | 共有 ON/OFF とリンク表示 |
| `src/components/WordLists/ListRow.tsx`・`src/app/(workspace)/edit/page.tsx`（変更） | メニュー「共有…」、「共有中」バッジ、削除確認の注記 |
| `src/app/(workspace)/shared/[id]/page.tsx`（新規） | 共有リストの表示とコピー |
| `src/messages/*/wordLists.json`・`errors.json`・`shared.json`（新規）・`src/i18n/messages.ts`・`src/i18n/messageTypes.ts` | 文言 |
| `tests/sharedLists.test.cjs`（新規）・`tests/wordLists.test.cjs`・`tests/listOverview.test.cjs`・`tests/workspace.test.cjs`・`tests/e2e/sharing.spec.ts`（新規） | テスト |

---

### Task 1: core — `shared` の検証とコピー関数

**Files:**
- Modify: `src/core/wordLists.ts`、`src/core/listOverview.ts`、`src/core/workspaceRequest.ts`
- Create: `src/core/sharedLists.ts`
- Test: `tests/sharedLists.test.cjs`（新規）、`tests/wordLists.test.cjs`、`tests/listOverview.test.cjs`

**Interfaces:**
- Produces:
  - `WordList` に `shared?: true` と `shareId?: string`
  - `type SharedListContent = { name: string; words: WordList['words'] }`
  - `type SharedList = SharedListContent & { updatedAt: string }`
  - `isShareId(value: unknown): value is string` — 小文字・大文字を問わない UUID 形式（`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`）
  - `decodeSharedList(value: unknown): SharedList` — 形が不正なら `AppError('invalidServerData')`
  - `copySharedList(lists: SavedWordList[], shared: SharedListContent, copyId: string, suffix: (n: number) => string, now?: Date): { lists: SavedWordList[]; copy: SavedWordList }`
  - `sharedKeys(lists: SavedWordList[]): string[]` — `shared` が true のリストの id
  - `stripShareIds(lists: SavedWordList[]): SavedWordList[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/sharedLists.test.cjs`:
- `isShareId`: `'0b7c6f0e-9d2a-4a3b-8c1d-2e3f4a5b6c7d'` は true。`'sample-1'`、`''`、`123`、末尾に `x` を付けた UUID は false。
- `decodeSharedList`: `{ name: 'N', words: [{ display: 'a', input: 'a', annotation: '' }], updatedAt: '2026-10-10T00:00:00.000Z' }` を受け付ける。`words` が配列でない、`name` が文字列でない、`updatedAt` がない、のときは `{ key: 'invalidServerData' }` を投げる。
- `copySharedList`:
  - `([], shared, 'c1', n => `（コピー${n === 1 ? '' : n}）`, new Date('2026-10-10T00:00:00Z'))` の `copy` が `{ id: 'c1', name: 'N', createdAt: '2026-10-10T00:00:00.000Z', words: [...], records: [] }` に deepEqual になる（`shared` も `shareId` もない）。
  - 同じ名前のリストがあると `name` が `'N（コピー）'`。2回コピーすると `'N（コピー2）'`。
  - `words` は複製で、元の配列とは別のオブジェクトになる。
  - 100件のときは `{ key: 'listLimit', values: { max: 100 } }` を投げる。
- `sharedKeys`: `[{...a, shared: true}, b]` → `['a']`。
- `stripShareIds`: `shareId` を消し、`shared` は残す。

`tests/wordLists.test.cjs` に追加:
- `decodeLists` が `shared: true` と `shareId: '...'` を受け付ける。`shared: false` と `shared: 'yes'` と `shareId: 1` は `savedDataCorrupted` を投げる。
- `saveList([{ ...list, shared: true }], { ...list, name: 'New' }, true)[0].shared === true`（編集フォームのリストに `shared` がなくても保持する）。

`tests/listOverview.test.cjs` に追加:
- `duplicateList([{ ...current[0], shared: true, shareId: 'x' }, ...], ...)` の `copy` に `shared` も `shareId` もない。

`tests/workspace.test.cjs`（DB 不要の部分）に追加:
- `validateWorkspaceRequest({ revision: 1, lists: [{ ...list, shared: true, shareId: 'x' }] }).lists[0]` に `shareId` がなく、`shared` は true。

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/sharedLists.test.cjs tests/wordLists.test.cjs tests/listOverview.test.cjs`
Expected: FAIL（`sharedLists.ts` がない、`shared` の検証がない）

- [ ] **Step 3: 実装する**

- `decodeLists` のリスト検証に、`shared` は `undefined` か `true`、`shareId` は `undefined` か文字列、を加える。
- `saveList` の編集時と同じ id の上書き時は、保存済みのリストの `shared` を引き継ぐ（`records` と同じ扱い）。
- `duplicateList` は今のまま（新しいオブジェクトを作るので `shared` は付かない）。テストで確かめる。
- `src/core/sharedLists.ts` に上の関数を置く。`copySharedList` は `copyName` と `MAX_LISTS` を `listOverview.ts` から使う。
- `validateLists` は `decodeLists` の前に `stripShareIds` を通す。

- [ ] **Step 4: 通ることを確認する**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5: コミットする**

`feat: 単語リストの共有フラグとコピー関数を追加`

---

### Task 2: DB — 共有テーブルと保存時の同期

**Files:**
- Modify: `prisma/schema.prisma`、`src/plugins/storage/cloud/repository.ts`
- Create: `prisma/migrations/0004_shared_lists/migration.sql`
- Test: `tests/workspace.test.cjs`

**Interfaces:**
- Consumes: Task 1 の `sharedKeys`、`SharedList`
- Produces:
  - Prisma モデル `SharedList`（`client.sharedList`）。項目は `shareId`（`@id @db.Uuid @map("share_id")`）、`ownerId`、`profileId`、`listId`、`name`、`words`（Json）、`updatedAt`。`@@unique([ownerId, profileId, listId])`、`@@index([ownerId])`、`@@map("typle_shared_lists")`
  - `workspaceRepository(client).read` と `.write` の戻り値の `lists` のうち、共有中のものに `shareId` が付く
  - `workspaceRepository(client).readShared(shareId: string): Promise<SharedList | null>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/workspace.test.cjs` に `test('shared lists follow the workspace', ...)` を追加する。既存の Prisma テストと同じ持ち主の作り方と後片付けにし、`typle_shared_lists` の後片付けも加える。確かめること:
- `write(owner, 0, { profileId: 'default', lists: [{ ...list, shared: true }] })` の `lists[0].shareId` が UUID になり、`readShared(id)` が `{ name: 'One', words: list.words, updatedAt: <ISO 文字列> }` を返す。
- 名前を `'Two'` にして保存すると、`readShared` の `name` が `'Two'` になり、`shareId` は同じまま。
- `shared` を外して保存すると、`readShared` が `null` になり、応答に `shareId` がない。
- 再び ON にすると、前とは違う新しい `shareId` になる。
- リストを削除すると行が消える。
- プロフィール `p2` のリストを共有したあと、`profiles` から `p2` を消すと、その行が消える。
- 古い revision での保存は `null` を返し、共有行は変わらない。
- 送られた shareId を無視：持ち主 B の共有 id を付けて持ち主 A が保存しても、B の `readShared` の内容は変わらず、A の `shareId` は B の id と異なる。
- `read(owner)` でも `shareId` が付く。別プロフィールを表示しているときは、そのプロフィールのリストにだけ付く。

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/workspace.test.cjs`
Expected: FAIL（`readShared` がない、テーブルがない）

- [ ] **Step 3: マイグレーションとスキーマを書く**

`migration.sql` は仕様書の SQL のとおりにする。インデックス名は Prisma の規約（`typle_shared_lists_owner_id_idx`、`typle_shared_lists_owner_id_profile_id_list_id_key`）に合わせ、`npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma` が差分なしになることを確認する。

- [ ] **Step 4: リポジトリを実装する**

- `write` は `client.$transaction(async tx => ...)` の中で、今の revision 比較とワークスペースの更新を行ったあと `syncShared(tx, ownerId, next)` を呼ぶ。
- `syncShared` は全プロフィール（`next.lists` が `default`、`next.profiles[i].lists` がそれ以外）の `sharedKeys` から `(profileId, listId)` を集める。持ち主の既存の行を1回読み、集合にない行を `deleteMany` で消す。集合にある行は、既存なら `update`（`name`・`words`・`updatedAt`）、なければ `create`（`shareId: randomUUID()`、`node:crypto` から）。
- 戻り値を作る `viewDocument(...)` の `lists` に、`(profileId, listId) → shareId` の対応表で `shareId` を付ける。`read` も同じ関数を通す。
- 競合（P2002/P2025）を `null` で返す今の処理は、トランザクションの外側で同じように扱う。
- `readShared` は `findUnique({ where: { shareId } })` を `{ name, words, updatedAt: updatedAt.toISOString() }` にして返す。

- [ ] **Step 5: 通ることを確認する**

Run: `npm run db:migrate && npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: コミットする**

`feat: 共有リストのテーブルと保存時の同期を追加`

---

### Task 3: 公開 API とブラウザー側の読み込み

**Files:**
- Create: `src/app/api/shared/[id]/route.ts`、`src/lib/useSharedList.ts`
- Modify: `src/plugins/storage/cloud/client.ts`、`src/messages/*/errors.json`（6言語）
- Test: Task 6 の E2E で API の応答も確かめる（Route Handler は `@/` の import があり `node --test` で読めないため）

**Interfaces:**
- Consumes: Task 1 の `isShareId`・`decodeSharedList`・`SharedList`、Task 2 の `readShared`
- Produces:
  - `GET /api/shared/<id>` → 200 `{ name, words, updatedAt }`。不正な形または存在しない id は 404 `{ error: 'sharedListNotFound' }`。DB の失敗は Sentry に送って 503 `{ error: 'databaseUnavailable' }`。ヘッダーは `Cache-Control: no-store`。
  - `readSharedList(id: string): Promise<SharedList>`（`client.ts`）— 404 なら `AppError('sharedListNotFound')`、それ以外の失敗は `AppError('workspaceRequestFailed')`
  - `useSharedList(id: string): { list: SharedList | null; error: AppError | null; loading: boolean }`（`src/lib/useSharedList.ts`）

- [ ] **Step 1: Next.js 16 の Route Handler の動的 `params` の書き方を `node_modules/next/dist/docs/` で確かめる**

- [ ] **Step 2: Route Handler を実装する**

`export const runtime = 'nodejs'` と `dynamic = 'force-dynamic'` を `/api/workspace` と同じように指定し、`database().readShared` を呼ぶ。認証は行わない。

- [ ] **Step 3: `readSharedList` と `useSharedList` を実装する**

- `useSharedList` は id が変わったら読み直す。アンマウント後には状態を更新しない。
- `errors.json` の6言語に `sharedListNotFound` を追加する（ja：「このリストは共有されていないか、削除されました。」）。

- [ ] **Step 4: 通ることを確認する**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS（`tests/i18n.test.cjs` を含む）

- [ ] **Step 5: コミットする**

`feat: 共有リストの公開APIを追加`

---

### Task 4: 共有する人の画面（`/edit`）

**Files:**
- Create: `src/components/WordLists/ShareDialog.tsx`
- Modify: `src/components/WordLists/ListRow.tsx`、`src/app/(workspace)/edit/page.tsx`、`src/messages/*/wordLists.json`（6言語）
- Test: Task 6 の E2E

**Interfaces:**
- Consumes: `useWordLists()` の `update`・`saving`・`storage`・`error`、`SavedWordList.shared`・`shareId`
- Produces:
  - `ListRow` の新しい props: `canShare: boolean`、`onShare: () => void`
  - `ShareDialog({ list, open, onOpenChange }: { list: SavedWordList; open: boolean; onOpenChange: (open: boolean) => void })` — 保存はダイアログの中で `useWordLists().update` を呼ぶ

- [ ] **Step 1: 文言を6言語に追加する**

`wordLists.json` の ja（他の言語も同じキーで訳す）:
- `row.share`: 「共有…」
- `row.shareLoginRequired`: 「ログインすると共有できます」
- `row.sharedBadge`: 「共有中」
- `share.title`: 「「{name}」を共有」
- `share.toggle`: 「リンクを知っている人に公開」
- `share.link`: 「共有リンク」
- `share.copyLink`: 「リンクをコピー」
- `share.copied`: 「コピーしました」
- `share.preparing`: 「リンクを準備しています…」
- `share.note`: 「コピーした人のリストには、あとの変更は反映されません。練習記録は公開されません。」
- `delete.sharedNote`: 「共有リンクも無効になります。」

- [ ] **Step 2: `ListRow` を変える**

- メニューの「エクスポート」の下に「共有…」（lucide の `Share2`）を置く。`canShare` が false のときは無効にし、`shareLoginRequired` を項目の下に小さく出す。
- 共有中のリストは、`h3` の横に `Badge variant="secondary"` で「共有中」を出す。

- [ ] **Step 3: `ShareDialog` を実装する**

- 既存の `src/components/ui/dialog.tsx` を使う。
- スイッチは `role="switch"` と `aria-checked` を持つ `button` にし、`share.toggle` をラベルにする。
- 押すと `update(lists => lists.map(item => item.id === list.id ? withShared(item, next) : item))` を呼ぶ。`withShared` は ON なら `shared: true` を付け、OFF なら `shared` と `shareId` を消す。
- 保存中（`saving`）は無効にする。保存に失敗したら `useWordLists().error` をダイアログの中に `role="alert"` で出す。
- ON で `shareId` があれば、`${location.origin}/shared/${shareId}` を読み取り専用の `input` に出し、「リンクをコピー」で `navigator.clipboard.writeText` を呼ぶ。成功したら2秒間「コピーしました」にする。ON で `shareId` がまだなければ `share.preparing` を出す。
- 表示するリストは、ダイアログを開いたときのものではなく、`lists` の中の今のものを id で引く（保存後の `shareId` を拾うため）。

- [ ] **Step 4: `/edit` につなぐ**

- `canShare={storage === 'account'}` を渡し、共有するリストの id を状態に持って `ShareDialog` を開く。
- 削除確認の `description` は、共有中なら元の文の後ろに `delete.sharedNote` を付ける。

- [ ] **Step 5: 通ることを確認する**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: コミットする**

`feat: 単語リストの共有ダイアログを追加`

---

### Task 5: リンクを開いた人の画面（`/shared/[id]`）

**Files:**
- Create: `src/app/(workspace)/shared/[id]/page.tsx`、`src/messages/*/shared.json`（6言語）
- Modify: `src/i18n/messages.ts`（`namespaces` に `shared: 0` を加える）、`src/i18n/messageTypes.ts`（`Messages` に `shared` を加える。既存の名前空間と同じ書き方）
- Test: Task 6 の E2E

**Interfaces:**
- Consumes: Task 3 の `useSharedList`、Task 1 の `copySharedList`、`useWordLists().update`・`storage`・`error`、`useSaveNotification()`、`randomId()`、`PageStorageBadge`
- Produces: ルート `/shared/<id>`

- [ ] **Step 1: 動的ルートのページの `params` の書き方を `node_modules/next/dist/docs/` で確かめる**

クライアントコンポーネントでは `useParams()` を使う。

- [ ] **Step 2: 文言を6言語に追加する**

`shared.json` の ja:
- `title`: 「共有された単語リスト」
- `wordCount`: 「{count}語」
- `columns.display`: 「表示」、`columns.input`: 「入力」、`columns.annotation`: 「補足」
- `copy`: 「自分のリストにコピー」
- `copied`: 「「{name}」を追加しました」
- `note`: 「コピーしたリストは自由に編集できます。元のリストの変更は反映されません。」
- `notFound`: 「このリストは共有されていないか、削除されました。」
- `toLists`: 「単語リストへ」

`metadata.json` にページタイトルの仕組みがあれば、それに合わせる。

- [ ] **Step 3: ページを実装する**

- 読み込み中は Skeleton を出す。
- 404 のときは `notFound` と `/edit` へのリンクを出す。
- 読み込めたら、`PageStorageBadge`、リスト名（`h1`）、単語数、`note`、単語の表（`src/components/ui/table.tsx`）、「自分のリストにコピー」ボタンを出す。
- ボタンは `update(current => copySharedList(current, list, copyId, n => tLists('page.copySuffix', { n })).lists)`（`tLists = useTranslations('wordLists')`。既存の複製と同じ番号の文言を使う） を呼ぶ。`listLimit` は `AppError` として `update` の失敗に乗るので、`useWordLists().error` を `role="alert"` で出す。成功したら `notify(t('copied', { name }))` を出し、`router.push('/edit?list=' + encodeURIComponent(copyId))` で移動する。
- 保存中はボタンを無効にする。

- [ ] **Step 4: 通ることを確認する**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 5: コミットする**

`feat: 共有リストのページとコピーを追加`

---

### Task 6: E2E とリリース準備

**Files:**
- Create: `tests/e2e/sharing.spec.ts`
- Modify: `package.json`・`package-lock.json`（0.31.0）、`README.md`

**Interfaces:**
- Consumes: Task 2〜5 のすべて。ログインは `tests/e2e/practice.spec.ts` と同じく `next-auth/jwt` の `encode` と `authjs.session-token` クッキーで行う。

- [ ] **Step 1: E2E を書く**

`test('a shared list can be opened and copied without login, and unsharing hides it', ...)`:
1. ログインした `context` で `/edit` を開く。最初のサンプルリストの「…」→「共有…」→ スイッチを ON にする。
2. ダイアログのリンクの `input` の値が `/shared/<UUID>$` に一致することを確かめ、値を取っておく。行に「共有中」が出ることを確かめる。
3. `page.request.get('/api/shared/<id>')` が 200 で、JSON のキーがちょうど `['name', 'updatedAt', 'words']` であることを確かめる。`/api/shared/not-a-uuid` と、ランダムな UUID は 404 になる。
4. 新しい `browser.newContext()`（未ログイン）でリンクを開く。リスト名と「このブラウザーに保存」が見えることを確かめ、「自分のリストにコピー」を押す。
5. `/edit?list=` に移動し、localStorage の `typle-r:guest-workspace:v1` の `lists` に同じ名前・単語・空の `records` のリストが入っていて、`shared` がないことを確かめる。`/play?list=<id>` で練習画面が開く。
6. 同じ未ログインのページでもう一度コピーすると、名前に（コピー）が付いた2件目になる。
7. ログイン側でスイッチを OFF にする。未ログイン側でリンクを開き直すと「このリストは共有されていないか、削除されました。」が出る。
8. 後片付け：`typle_workspaces` と `typle_shared_lists` から、テスト用の持ち主の行を消す。

`test('guests cannot share', ...)`：未ログインで `/edit` を開くと、メニューの「共有…」が無効で「ログインすると共有できます」が見える。

- [ ] **Step 2: 実行する**

Run: `npm run build && npx playwright test tests/e2e/sharing.spec.ts`
Expected: PASS

- [ ] **Step 3: 全体の確認とリリース準備**

- `npm version 0.31.0 --no-git-tag-version` を実行する。
- README に「単語リストの共有」の節を追加する。内容：ログイン時だけ共有できる、リンクを知っている人が見られる、コピーは独立している、練習記録は公開しない、共有テーブル `typle_shared_lists`。
- Run: `npm run typecheck && npm test && npm run lint && npm run build && npm run test:e2e`
- Expected: すべて PASS

- [ ] **Step 4: コミットしてプッシュする**

`feat: 単語リストのリンク共有（v0.31.0）`。プッシュして PR #38 の説明のチェックリストを更新し、下書きを外す。
