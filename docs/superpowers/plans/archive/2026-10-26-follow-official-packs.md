# 公式パックのフォロー Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公式パックを「コピーして追加」から「フォロー（公式の更新を読み込みのたびに反映、読み取り専用）」に変え、アカウントを空で始める。

**Architecture:** フォロー中のパックは普通のパック・リストとして保存し、`origin.followed` とリストの `origin.listId` で公式と結びつける。保存データを読むたびに「移行（古いコピーを消す）→ 同期（公式に揃える）」を TS（ゲスト）と Go（アカウント・API）で同じ規則で適用する。規則は共通 fixture で両方から確かめる。

**Tech Stack:** Next.js 16（App Router）・React 19・next-intl・TypeScript（`node --test` + `tests/register.cjs`）・Go（`server/internal`）・Playwright。

**Spec:** `docs/superpowers/specs/2026-10-26-follow-official-packs-design.md`

## Global Constraints

- `src/core` は `src/plugins` を import しない。公式パックの定義は引数で渡す
- フォロー中のパック: `origin: { catalogId, version, followed: true }`。リスト: `origin: { listId }`
- 同期で新しく作るリストの id: `` `${pack.id}:${officialList.id}` ``、`createdAt` は公式リストの `createdAt`、`records: []`
- パック名・パック id・`createdAt` は同期で変えない
- エラーキー: `packFollowed`（TS は `AppError('packFollowed')`、Go API は `409 { "error": "packFollowed" }`）
- メッセージは 6 言語（`src/messages/{en,fr,ja,ru,zh-CN,zh-TW}`）すべてに入れる（`tests/i18n.test.cjs` が揃っているか確かめる）
- バージョン: `package.json` を `0.98.0`（`package-lock.json` も）
- コード中のコメントは周りと同じく英語、仕様書・`docs/api.md`・fixture の README は日本語

## Review Focus

- フォロー中のパックに記録がある状態で公式のリストが並べ替え・改名された → 記録は `origin.listId` で同じリストに残る（Task 1 の fixture `sync-renamed-reordered`）
- フォロー時に同名の自分のパックがある → 「名前（2）」でフォローし、以後の同期でも名前は（2）のまま（Task 1 `followPack` テスト・fixture `sync-keeps-name`）
- 公式リストと同じ `origin.listId` を持つリストが 1 パックに 2 つある（古いアプリが複製した等）→ 最初の 1 つだけ残り、もう 1 つは消える（Task 1 fixture `sync-duplicate-origin`）
- ゲストの保存で 2 回目以降の読み込み・書き込みが同じ結果になる（同期は冪等）→ Task 1 の冪等テストと Task 2 のゲストテスト
- 古いアプリ形式（`packs` が `null`）の保存データ → 変換後に移行がかかり、初期リストの id のパックが消える（Task 1 fixture `migrate-unconverted`）

---

### Task 1: コアの移行・同期・フォロー（TS）と共通 fixture

**Files:**
- Create: `src/core/followedPacks.ts`
- Modify: `src/core/wordPacks.ts`（`WordPack['origin']` に `followed?: true`、`decodePacks` で `followed` が `true` 以外なら `savedDataCorrupted`）
- Modify: `src/core/wordLists.ts`（`WordList` に `origin?: { listId: string }`。`decodeLists` は形の違う `origin` を落とす。保存はそのまま）
- Create: `tests/fixtures/follow/README.md`、`tests/fixtures/follow/*.json`
- Create: `tests/followedPacks.test.cjs`

**Interfaces:**
- Produces（`src/core/followedPacks.ts`）:
  - `export type OfficialPack = { catalogId: string; version: number; pack: WordPack; lists: SavedWordList[] }`（`src/plugins/packs/catalog.ts` から移す）
  - `export const isFollowed = (pack: Pick<WordPack, 'origin'>) => boolean`
  - `export function followOfficial(library: Library, official: OfficialPack[]): Library` — 移行 → 同期。冪等
  - `export function followPack(library: Library, official: OfficialPack[], catalogId: string, ids: NewPackIds, now = new Date()): Library` — 最後にパックを入れる。名前は `addPackFile` と同じく重なれば「（2）」…。結果に `followOfficial` をかけて返す。ない `catalogId` は `AppError('packDeleted')`

fixture の形（1 ファイル 1 ケース）: `{ "official": OfficialPack[], "library": { "lists": [...], "packs": [...] | null }, "expected": { "lists": [...], "packs": [...] } }`。`library` に `normalizeLibrary(lists, packs)` → `followOfficial(_, official)` をかけた結果が `expected`。`official` は小さな架空のカタログ（catalogId `go`・`kotlin` など）を使う。

- [ ] **Step 1: fixture を書く**

次のケースを作る（名前 = ファイル名）。README には上の形と下の規則の要約を書く。
- `migrate-copies`: `followed` のない `origin` のパック（記録あり・単語編集あり）と、`origin` なしで `id` が `go` のパックが消え、自分のパックは残る
- `migrate-unconverted`: `packs: null` の古い保存データで、`group` が公式と同名・`id` が公式のパックになるもの — 変換後、`id` が catalogId と一致したパックだけ消える
- `sync-words`: フォロー中の `go` の単語・難易度・説明・カテゴリ・タグが公式に揃い、記録・リスト id・`createdAt` は残る
- `sync-renamed-reordered`: 公式でリストの順と名前が変わった — 公式の順に並び、記録は `origin.listId` で引き継がれる
- `sync-added-removed`: 公式で増えたリストが `<packId>:<listId>` の id・公式の `createdAt`・記録なしで加わり、公式にないリストと `origin` のないリストは記録ごと消える
- `sync-removed-pack`: カタログにない `catalogId` のフォロー中パックが消える
- `sync-keeps-name`: パック名「Go（2）」は公式名「Go」に戻らない
- `sync-duplicate-origin`: 同じ `origin.listId` の 2 リスト → 先の 1 つだけ残る
- `sync-position`: 自分のパックのリストの間にあるフォロー中パックのリストが、そのパックの最初のリストの位置にまとまる

- [ ] **Step 2: 失敗するテストを書く**（`tests/followedPacks.test.cjs`）

```js
for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
  test(`fixture ${file}`, () => {
    const { official, library, expected } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const once = followOfficial(normalizeLibrary(library.lists, library.packs), official)
    assert.deepEqual(once, expected)
    assert.deepEqual(followOfficial(once, official), once)   // 冪等
    validateLibrary(once)
  })
}
```
加えて `followPack` のテスト: 空のライブラリに `go` をフォロー → `packs[0].origin` が `{ catalogId: 'go', version: 1, followed: true }`、リストの `origin.listId` が公式の順、`id` は `ids` のとおり。同名パックがあるときは「Go（2）」。ない catalogId は `packDeleted`。`decodePacks` が `followed: false` を `savedDataCorrupted` にする。

- [ ] **Step 3: 実行して失敗を確かめる**

Run: `node --test tests/followedPacks.test.cjs`
Expected: FAIL（`Cannot find module '../src/core/followedPacks.ts'`）

- [ ] **Step 4: `src/core/followedPacks.ts` を実装し、型を足す**

`followOfficial` の手順（仕様書「読み込み時の変換」のとおり）: catalogId の集合を作る → 消すパック（`origin && !followed`、`!origin && catalogIds.has(id)`、`followed && !catalog.has(catalogId)`）とそのリストを除く → フォロー中のパックごとに公式リストの順で新しいリスト列を作る（`origin.listId` で最初に見つかった既存リストを使い、名前・`levels`・`words` を公式の値に。なければ新規）→ ライブラリのリスト列を先頭から走査し、フォロー中のパックのリストに最初に出会った位置で、そのパックの新しいリスト列をまとめて出す。パックの `description`・`category`・`tags` は公式の値（ないものは項目ごと除く）。

- [ ] **Step 5: テストが通るのを確かめる**

Run: `node --test tests/followedPacks.test.cjs tests/wordPacks.test.cjs tests/wordLists.test.cjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core tests/fixtures/follow tests/followedPacks.test.cjs
git commit -m "feat: follow official packs in the core: migration, sync and follow"
```

### Task 2: カタログ・空の初期状態・ゲストの同期（TS）

**Files:**
- Modify: `src/plugins/packs/index.ts`（`initialLibrary` を `{ packs: [], lists: [] }` に。今の作り方は `officialLibrary` として残す）
- Modify: `src/plugins/packs/catalog.ts`（`officialPacks()` は `officialLibrary` から作る。`OfficialPack` は core から re-export。`CatalogEntry.added` を `followed` に改名: `library.packs.some(p => isFollowed(p) && p.origin!.catalogId === entry.catalogId)`。`addOfficialPack` を削除し、`followOfficialPack(library, catalogId, ids, now)` = `followPack(library, officialPacks(), …)`）
- Modify: `src/plugins/storage/guest.ts`（`readGuestWorkspace` と `writeGuestWorkspace` の戻り値のライブラリに `followOfficial(_, officialPacks())` をかける。読み込みで変わったときも保存はしない — 次の書き込みで保存される）
- Modify: `tests/packCatalog.test.cjs`、`tests/guestWorkspace.test.cjs`、ほか `initialLibrary` / `initialLists` が全パックを持つ前提のテスト

**Interfaces:**
- Consumes: Task 1 の `followOfficial`・`followPack`・`isFollowed`・`OfficialPack`
- Produces: `officialPacks(): OfficialPack[]`、`catalogEntries(library): (OfficialPack & { followed: boolean })[]`、`followOfficialPack(library: Library, catalogId: string, ids: NewPackIds, now?: Date): Library`、`initialLibrary` は空

- [ ] **Step 1: 失敗するテストを書く**
  - `packCatalog.test.cjs`: `initialLibrary` が `{ packs: [], lists: [] }`。`officialPacks()` の catalogId が 27 個で、今の値と同じ並び（先頭 2 つを固定値で確かめる）。`followOfficialPack` 後に `catalogEntries(...).find(e => e.catalogId === id).followed === true`。`followed` のない `origin` のパックは `followed: false`
  - `guestWorkspace.test.cjs`: `origin` 付き（`followed` なし）のパックを持つゲストデータを読むと消えている。フォロー中のパックの単語を書き換えて保存 → 読むと公式の単語に戻っている

- [ ] **Step 2: 実行して失敗を確かめる**

Run: `node --test tests/packCatalog.test.cjs tests/guestWorkspace.test.cjs`
Expected: FAIL

- [ ] **Step 3: 実装する**（上の Files のとおり）

- [ ] **Step 4: 全ユニットテストを流し、初期パック前提で落ちるテストを直す**

Run: `npm test`
Expected: PASS。初期リストを使っていたテストは、テスト内で `followOfficialPack` するか `officialLibrary` を直接使うよう書き換える（テストの意図は変えない。skip しない）

- [ ] **Step 5: Commit**

```bash
git add src/plugins tests
git commit -m "feat: start empty and follow official packs from the catalog"
```

### Task 3: フォロー中のパックの編集禁止（TS）とメッセージ

**Files:**
- Modify: `src/core/packEditing.ts`（`updatePack`・`reorderPackLists`・`saveListInPack`（対象パックまたは編集するリストのパックがフォロー中）で `AppError('packFollowed')`。`deletePack` は許す）
- Modify: `src/core/listOverview.ts`（`duplicateList` の元リストがフォロー中のパックなら `packFollowed`）
- Modify: リストのパック移動を行う関数（`src/core/packEditing.ts` 内、`/edit` の移動ダイアログが呼ぶもの）— 移動元・移動先がフォロー中なら `packFollowed`
- Modify: `src/messages/*/errors.json`（`packFollowed`。ja: 「公式パックは編集できません。複製すると自分のパックとして編集できます」）
- Test: `tests/packEditing.test.cjs`

**Interfaces:**
- Consumes: Task 1 の `isFollowed`
- Produces: エラーキー `packFollowed`

- [ ] **Step 1: 失敗するテストを書く** — フォロー中のパックに対して上の各関数が `{ key: 'packFollowed' }` を投げる。`deletePack` と `copyPack` は通り、`copyPack` の結果に `origin` がなく、リストにも `origin` がない
- [ ] **Step 2: 実行して失敗を確かめる** — Run: `node --test tests/packEditing.test.cjs` Expected: FAIL
- [ ] **Step 3: 実装する**（`copyPack` はリストの `origin` も落とすこと）
- [ ] **Step 4: 通るのを確かめる** — Run: `npm test && npm run typecheck` Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: refuse edits to followed packs"`

### Task 4: Go の移行・同期・空の初期状態・API の編集禁止

**Files:**
- Modify: `server/internal/workspace/packs_library.go`（`Origin` に `Followed bool \`json:"followed,omitempty"\``、`decodePacks` で `followed` が `true` 以外の値なら壊れたデータ）
- Modify: `server/internal/workspace/workspace.go`（`List` に `Origin *ListOrigin`（`ListID string`）。`rawList` で読み書きし、`extra` には残さない。`Decode` の `normalizeLibrary` の後に `followOfficial`）
- Create: `server/internal/workspace/follow.go`（`OfficialPack`・`OfficialPacks()`・`followOfficial(packs []Pack, lists []List, official []OfficialPack) ([]Pack, []List)`）
- Modify: `server/internal/workspace/packs.go`（今の `Initial()` の中身を `OfficialPacks()` に移し、`Initial()` は空のパック・リスト・端末を返す）
- Modify: `server/internal/workspace/packs_edit.go`・`lists.go`・`copy.go`（`UpdatePack`・`CreateList`（`packId` がフォロー中）・`UpdateList`・`DeleteList`・`CopyList` で `&Error{Key: "packFollowed"}`。`CopyPack` はリストの `Origin` を落とす）
- Modify: `server/internal/api/write.go`（`refuse` で `packFollowed` を `409`）
- Modify: `docs/api.md`（`origin.followed`、リストの `origin`、`409 packFollowed` の対象 API、空の初期状態）
- Test: `server/internal/workspace/follow_test.go`、`workspace_test.go`（`TestInitial` を `TestOfficialPacks` にし、`TestInitial` は空を確かめる）、`packs_edit_test.go`（`TestInitialPacksHaveOrigin` を `OfficialPacks` 版に）、`server/internal/api/write_test.go`

**Interfaces:**
- Consumes: Task 1 の fixture（`tests/fixtures/follow/*.json`）。Go の `followOfficial` は TS と同じ結果を返す
- Produces: `func OfficialPacks() ([]OfficialPack, error)`（TS の `officialPacks()` と同じ catalogId・並び）、`type OfficialPack struct { CatalogID string; Version int; Pack Pack; Lists []List }`

- [ ] **Step 1: 失敗するテストを書く**
  - `follow_test.go`: `tests/fixtures/follow/*.json` を全部読み、`library` に `normalizeLibrary` → `followOfficial` をかけて `expected` と比べる（`packs_library_test.go` の fixture テストの比べ方に揃える）。2 回かけても同じ
  - `TestOfficialPacks`: 27 個、先頭 2 つの catalogId が TS と同じ。各リストの `Records` は空
  - `TestInitial`: パック・リストが空
  - `write_test.go`: フォロー中のパックを持つワークスペースで `PATCH /api/v1/packs/{p}`・`PATCH /api/v1/lists/{l}`・`DELETE /api/v1/lists/{l}`・`POST /api/v1/lists/{l}/copy`・`POST /api/v1/lists`（`packId`）が `409 {"error":"packFollowed"}`。`DELETE /api/v1/packs/{p}` は `204`、`POST /api/v1/packs/{p}/copy` は `201` で応答の `pack` に `origin` がない。記録の追加は `201`
- [ ] **Step 2: 実行して失敗を確かめる** — Run: `go test ./server/...` Expected: FAIL
- [ ] **Step 3: 実装する**（上の Files のとおり。`followOfficial` の手順は Task 1 Step 4 と同じ）
- [ ] **Step 4: 通るのを確かめる** — Run: `go test ./server/... && go vet ./...` Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(go): follow official packs: migration, sync, empty start and refused edits"`

### Task 5: 画面（カタログ・パック一覧・空の状態）

**Files:**
- Modify: `src/app/(workspace)/packs/catalog/page.tsx`（「追加」→「フォローする」= `followOfficialPack`。成功で `notify(t("followed", { name }))` し `/edit` に戻る。フォロー中は「フォロー中」の表示・「開く」・「フォロー解除」）
- Create: `src/components/WordLists/UnfollowDialog.tsx`（`DeleteConfirmation` を使う確認ダイアログ。本文 ja: 「「{name}」のフォローを解除します。このパックの記録も消えます」。確定で `deletePack`、通知 ja: 「「{name}」のフォローを解除しました」）
- Modify: `src/components/WordLists/PackRow.tsx` と `src/app/(workspace)/edit/page.tsx`（フォロー中のパックに「公式」バッジ。名前等の編集・リストの追加/編集/削除/移動/並べ替え・パックの削除を出さず、「フォロー解除」を出す。複製・書き出し・共有は残す。パックがないとき、案内 ja: 「まだパックがありません。公式パックをフォローするか、新しいパックを作りましょう」と `/packs/catalog` へのリンク）
- Modify: `src/app/(workspace)/packs/edit/page.tsx`（フォロー中のパックを開いたら編集フォームの代わりに `packFollowed` の説明と「複製」「フォロー解除」）
- Modify: `src/app/(workspace)/play/page.tsx`（パックがないとき同じ案内とリンク）
- Modify: `src/messages/*/wordLists.json` ほか（新しい文言を 6 言語に。`catalog.add`・`addPack`・`added`・`addedState` は `follow`・`followPack`・`followed`・`following` に置き換え）

**Interfaces:**
- Consumes: Task 2 の `catalogEntries`・`followOfficialPack`、Task 1 の `isFollowed`、`deletePack`

- [ ] **Step 1: E2E を書く**（`tests/e2e/follow.spec.ts`、ゲストで）: `/edit` に案内が出る → リンクで `/packs/catalog` → 「Go構文」を「フォローする」→ `/edit` に「Go構文」と「公式」バッジ、編集ボタンがない → `/play` で Go構文を選んで練習を始められる → `/packs/catalog` で「フォロー解除」→ 確認 → `/edit` から消える
- [ ] **Step 2: 実行して失敗を確かめる** — Run: `npx playwright test tests/e2e/follow.spec.ts` Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `npx playwright test tests/e2e/follow.spec.ts && npm run lint && npm run typecheck && npm test` Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: follow and unfollow official packs on the catalog and pack list"`

### Task 6: 既存の E2E の修正とリリース準備

**Files:**
- Modify: 初期パック前提の `tests/e2e/*.spec.ts`（`packs-migration.spec.ts`・`play.spec.ts`・`practice.spec.ts`・`packs.spec.ts`・`guest.spec.ts` など、実行して落ちるもの）
- Create: `tests/e2e/follow.ts`（`followPacks(page, names: string[])`: ゲストの LocalStorage に `followOfficialPack` 相当のデータを入れる、またはカタログ画面で順にフォローするヘルパー）
- Modify: `package.json`・`package-lock.json`（`0.98.0`）

- [ ] **Step 1: E2E 全体を流して落ちるものを洗い出す** — Run: `npm run test:e2e` Expected: 初期パック前提のテストが FAIL
- [ ] **Step 2: 落ちたテストの準備で `followPacks` を使うよう直す**。`packs-migration.spec.ts` のうち初期パックが残る前提の検証は、移行で公式パックのコピーが消えることの検証に書き換える。テストの skip・削除はしない
- [ ] **Step 3: 全部通るのを確かめる** — Run: `npm run lint && npm run typecheck && npm test && go test ./server/... && npm run build && npm run test:e2e` Expected: すべて PASS
- [ ] **Step 4: バージョンを 0.98.0 にする** — Run: `npm version 0.98.0 --no-git-tag-version` Expected: `v0.98.0`
- [ ] **Step 5: Commit** — `git commit -m "test: follow official packs in the e2e setup; v0.98.0"`
