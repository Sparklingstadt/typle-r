# 単語パック PR 1（データ構造と移行）Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存データに単語パックを入れ、すべてのリストが必ず1つのパックに属するようにする。画面の見た目と動きは v0.90.0 のまま（v0.91.0）。

**Architecture:** 保存形式は `packs` 配列＋リストの `packId`（spec の案A）。TS（`src/core/wordPacks.ts`）と Go（`server/internal/workspace/packs_library.go`）に同じ「変換・補正・反映」の規則を実装し、`tests/fixtures/packs/` の同じ入力と期待値で両方を確かめる。画面はこれまでの `SavedWordList`（`group`・`category`・`tags` 付き）を見るので、保存した形から画面用の形を作る `viewLists` と、画面での変更を保存の形に戻す `applyListChange` を間に挟む。Go の公開 API も同じく、デコード時に `List.Category`・`Tags` をパックから埋め、保存前に `ApplyListChange` で戻す。

**Tech Stack:** TypeScript（Next.js 16・`node --test`）、Go（`server/`）、PostgreSQL（Prisma のマイグレーション SQL）、Kotlin（typle-kotlin-backend・Ktor）、Playwright

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（この計画は「実装の分け方」の PR 1）

## spec からの変更（この計画で決めたこと）

- **初期リストのファイル（`src/plugins/packs/*.json`）は変えない。** typle-ipad・typle-w・typle-a のテストは写しが typle-r のファイルと同じことを確かめるため、`packId` を足すとそれらが失敗する。初期のパックは `initialLists` に1節の変換をかけて作る（`initialLibrary`）。`packs.json`・`catalogId`・`origin` は PR 5（カタログ）で入れる。Go の `packs/` の写しと `TestPacksMatchApp` も変えない。
- **`GET /api/workspace` は保存した `packs` をそのまま返す（未変換の行は `null`）。** spec 6節の「`NULL` なら変換した結果」ではなく、サーバーはこのエンドポイントで変換せず、`null` を受け取ったアプリが1節の変換をする。
- **リスト API（`/api/v1/lists`）の `packId` 指定・`levels`・パックのエンドポイントは PR 5。** PR 1 ではリストの応答に `packId` を足すだけで、作成は `packId` なし（1リストのパックができる）、`category`・`tags` の作成・変更はパックの値を変える。

## Global Constraints

- パック名: 前後の空白を除いて1文字以上、200文字まで（`MAX_PACK_NAME = 200`）。ほかのパックと同じ名前は不可（前後の空白を除き `toLocaleLowerCase` で比べる）。
- 説明: 500文字まで（`MAX_PACK_DESCRIPTION = 500`）。空なら保存しない。
- パックのカテゴリ・タグ: `normalizeLabels` と `MAX_CATEGORY`（50）・`MAX_TAG`（50）・`MAX_TAGS`（20）。
- パックの数には別の上限を設けない。パックには必ず1つ以上のリストがあるので、リストの数の上限（`MAX_LISTS`、150）がパックの数も抑える（削除したプロファイルから統合したアカウントは150を超えるリストを持てるため、パックに別の上限を置くと保存できなくなる）。
- リスト名は同じパックの中だけで重複不可。保存するリストは `packId` を持ち、`group`・`category`・`tags` を持たない。
- 変換した ID: `group` のパックは `pack-<そのgroupの最初のリストのid>`、それ以外は `pack-<リストのid>`。
- 名前の重なりの付け方: 「名前（2）」「名前（3）」…（全角括弧）。200文字を超えるときは `fit`（`src/core/workspaceDocument.ts`）と同じく元の名前を切る。
- 知らない項目はパックでも残す（TS は `{ ...pack }`、Go は `extra.go` の `unknown`/`withExtra`）。
- ブラウザー保存のキー `typle-r:guest-workspace:v1`・`version: 1` は変えない。
- DB の `packs` が `NULL`、ブラウザー保存に `packs` がない ＝ 未変換。
- 出力・コミットメッセージ・README は日本語（`CLAUDE.md`）。

## Review Focus

1. **古いアプリ（iPad など）が `packs` を送らずに `lists` だけ保存した後** — `packId` のないリスト・消えたリストがあっても読めて、1リストのパックができ、空のパックが消える（Task 1・Task 4 の fixture `old-app-save`）。
2. **`group` 名と、`group` のないリストの名前が同じ** — 後のパックが「名前（2）」になり、保存できる（fixture `name-collision`）。
3. **画面で1リストだけのパックのリストを改名** — パック名もついて変わる。複数リストのパックでは変わらない（Task 2 のテスト）。
4. **パックのタグが大文字小文字だけ違う** — 変換で和集合を取るとき最初の表記を残す（fixture `group-tags`）。
5. **保存されていない（revision 0）アカウント・ゲスト** — 初期リストがパック付きで表示され、最初の保存で `packs` も書かれる（Task 3 の `workspaceSession` テストと Task 7 の E2E）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/core/wordPacks.ts`（新） | `WordPack` 型、`decodePacks`、`convertLibrary`・`repairLibrary`・`normalizeLibrary`、`validateLibrary`、`viewLists`・`applyListChange` |
| `tests/fixtures/packs/*.json`（新） | 変換・補正の入力と期待値。TS と Go の両方が読む |
| `tests/wordPacks.test.cjs`（新） | `wordPacks.ts` の単体テスト |
| `src/core/wordLists.ts` | `packId` を読み書きする |
| `src/core/workspaceDocument.ts`・`workspaceRequest.ts`・`workspaceStore.ts`・`workspaceSession.ts` | 文書に `packs` を持たせる |
| `src/plugins/storage/guest.ts`・`cloud/client.ts` | `packs` を保存・送受信する |
| `src/plugins/packs/index.ts` | `initialLibrary` を出す |
| `src/lib/useWordLists.tsx` | `initialLibrary` を渡す |
| `server/internal/workspace/packs_library.go`（新）・`workspace.go`・`encode.go` | Go の `Pack`、デコード・変換・補正・反映・エンコード |
| `server/internal/store/store.go`・`server/internal/web/workspace.go`・`request.go` | `packs` 列の読み書き |
| `server/internal/workspace/overview.go` などのリスト API の応答 | `packId` を足す |
| `prisma/migrations/0024_packs/migration.sql`（新）・`prisma/schema.prisma` | `packs jsonb NULL` 列 |
| typle-kotlin-backend の `workspace/Workspace.kt`・`store/Store.kt`・`web/WorkspaceRoutes.kt` | `packs` 列の読み書きと検証 |
| `tests/e2e/packs-migration.spec.ts`（新） | 古いデータからの変換 |
| `README.md`・`docs/api.md`・`package.json`・`package-lock.json` | v0.91.0 |

---

### Task 1: パックの型・変換・補正（TS）と共通の fixture

**Files:**
- Create: `src/core/wordPacks.ts`
- Create: `tests/fixtures/packs/README.md`、`tests/fixtures/packs/{groups,group-tags,name-collision,old-app-save,labels-to-pack,duplicate-in-pack}.json`
- Create: `tests/wordPacks.test.cjs`
- Modify: `src/core/wordLists.ts`（`WordList` に `packId?: string`。`decodeLists` で文字列であることを確かめる。`saveList` は `packId` を残す）

**Interfaces:**
- Produces:
  ```ts
  export const MAX_PACK_NAME = 200
  export const MAX_PACK_DESCRIPTION = 500
  export type WordPack = { id: string; name: string; description?: string; category?: string; tags?: string[];
    origin?: { catalogId: string; version: number }; createdAt: string }
  /** 保存の形: lists は packId を持ち、group・category・tags を持たない。 */
  export type Library = { packs: WordPack[]; lists: SavedWordList[] }
  export function decodePacks(value: unknown): WordPack[]          // 形が違えば AppError('savedDataCorrupted')
  export function convertLibrary(lists: SavedWordList[]): Library  // 未変換（packs が null）
  export function repairLibrary(library: { packs: WordPack[]; lists: SavedWordList[] }): Library
  export function normalizeLibrary(lists: SavedWordList[], packs: WordPack[] | null): Library
  export function validateLibrary(library: Library): void          // 違反は Error('Invalid packs')
  ```
- fixture の形: `{ "lists": [...], "packs": [...] | null, "expected": { "packs": [...], "lists": [...] } }`。`expected` は `normalizeLibrary(lists, packs)` の結果そのもの。

- [ ] **Step 1: fixture を書く**

`tests/fixtures/packs/README.md` に「入力 `lists`・`packs` に `normalizeLibrary`（Go は `workspace.Decode`）をかけた結果が `expected`。TS は `tests/wordPacks.test.cjs`、Go は `server/internal/workspace/packs_library_test.go` が読む」と書く。各ファイルの中身:

- `groups.json`（`packs: null`）: リスト `a`（group `Linux`, levels `["基本","初級"]`, category `プログラミング`, tags `["Linux"]`, createdAt `2026-10-02T00:00:00.000Z`）、`b`（group なし, category `語学`）、`c`（group `Linux`, levels `["基本","上級"]`, createdAt `2026-10-01T00:00:00.000Z`, tags `["シェル"]`）。期待値: packs が `[{ id: "pack-a", name: "Linux", category: "プログラミング", tags: ["Linux","シェル"], createdAt: "2026-10-01T00:00:00.000Z" }, { id: "pack-b", name: "b", category: "語学", createdAt: b の createdAt }]`、lists は `a`・`b`・`c` の順のまま、それぞれ `packId`（`pack-a`・`pack-b`・`pack-a`）を持ち、`group`・`category`・`tags` がなく、`levels` は残る。
- `group-tags.json`（`packs: null`）: 同じ group の2リストで tags が `["Go","cli"]` と `["CLI","test"]`。期待値の tags は `["Go","cli","test"]`。
- `name-collision.json`（`packs: null`）: group `Go` のリスト2つ（`g1`・`g2`）の前に、group なしで名前が `go` のリスト `x`。期待値: packs は `[{ id: "pack-x", name: "go" }, { id: "pack-g1", name: "Go（2）" }]`（順番は各パックの最初のリストが出る順）。
- `old-app-save.json`（packs あり）: packs `[{ id: "p1", name: "P", category: "C" }, { id: "p2", name: "Gone" }]`、lists `[{ id: "a", packId: "p1" }, { id: "b" /* packId なし */, category: "古い", tags: ["t"] }, { id: "c", packId: "missing" }, { id: "d", packId: "p1", category: "X" }]`。期待値: packs `[p1（category "C" のまま）, { id: "pack-b", name: "b", category: "古い", tags: ["t"] }, { id: "pack-c", name: "c" }]`（`p2` はリストがないので消える。新しいパックは既存のパックの後に、リストの順で）。lists は全員 `packId` を持ち、`category`・`tags` がない。
- `labels-to-pack.json`: packs `[{ id: "p1", name: "A", tags: ["x"] }]`、lists `[{ id: "a", packId: "p1", tags: ["y"] }]`。p1 に tags があるのでリストの `["y"]` は捨てる。パックにカテゴリ・タグがないときだけリストの値を入れる、を確かめる2つ目のパック `p2`（ラベルなし）とリスト `b`（packId p2, category `Z`）も入れ、期待値で p2 の category が `Z`。
- `duplicate-in-pack.json`: packs `[{ id: "p1", name: "A" }]`、lists `[{ id: "a", name: "初級", packId: "p1" }, { id: "b", name: "初級", packId: "p1" }]`。期待値の `b` の名前は `初級（2）`。

各リストは `words: [{ "display": "ls", "input": "ls", "annotation": "" }]`・`records: []`・`createdAt` を持つ（省略した `createdAt` は `2026-10-01T00:00:00.000Z`）。パックの `createdAt` は、変換で作ったものはそのリスト（group なら最も古いリスト）の `createdAt`、補正で作ったものも同じくそのリストの `createdAt`。

- [ ] **Step 2: 失敗するテストを書く**

`tests/wordPacks.test.cjs`:

```js
require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeLibrary, decodePacks, validateLibrary } = require('../src/core/wordPacks.ts')

const dir = path.join(__dirname, 'fixtures/packs')
for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
  test(`fixture ${file}`, () => {
    const { lists, packs, expected } = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    const result = normalizeLibrary(lists, packs)
    assert.deepEqual(result, expected)
    validateLibrary(result)
    // 変換・補正した結果をもう一度かけても変わらない。
    assert.deepEqual(normalizeLibrary(result.lists, result.packs), result)
  })
}

test('packs keep fields Typle does not know and refuse wrong shapes', () => {
  const pack = { id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z', future: 1 }
  assert.deepEqual(decodePacks([pack]), [pack])
  for (const bad of [null, {}, [{ ...pack, id: 1 }], [{ ...pack, tags: 'x' }], [pack, pack]]) {
    assert.throws(() => decodePacks(bad), { key: 'savedDataCorrupted' })
  }
})

test('validateLibrary refuses what a save must not contain', () => {
  const list = { id: 'a', name: 'a', packId: 'p', words: [{ display: 'ls', input: 'ls', annotation: '' }], records: [], createdAt: '2026-10-01T00:00:00.000Z' }
  const pack = { id: 'p', name: 'P', createdAt: '2026-10-01T00:00:00.000Z' }
  validateLibrary({ packs: [pack], lists: [list] })
  for (const library of [
    { packs: [pack], lists: [{ ...list, packId: 'q' }] },                      // 存在しないパック
    { packs: [pack, { ...pack, id: 'q' }], lists: [list] },                     // 空のパック・同じ名前
    { packs: [{ ...pack, name: ' ' }], lists: [list] },
    { packs: [{ ...pack, name: 'n'.repeat(201) }], lists: [list] },
    { packs: [{ ...pack, description: 'd'.repeat(501) }], lists: [list] },
    { packs: [pack], lists: [list, { ...list, id: 'b', name: 'A' }] },          // パック内で同じ名前
    { packs: [pack], lists: [{ ...list, category: 'c' }] },                     // 保存の形でない
  ]) assert.throws(() => validateLibrary(library))
})
```

- [ ] **Step 3: 失敗を確かめる**

Run: `node --test tests/wordPacks.test.cjs`
Expected: FAIL（`Cannot find module '../src/core/wordPacks.ts'`）

- [ ] **Step 4: `src/core/wordPacks.ts` を実装する**

`decodePacks` は配列で、各要素が `id`（空でない文字列・重複なし）・`name`・`createdAt` が文字列、`description`・`category` が文字列か省略、`tags` が文字列の配列か省略、`origin` が `{ catalogId: string, version: number }` か省略であることを確かめ、要素をそのまま（知らない項目ごと）返す。

`convertLibrary` は spec 1節「変換」の1〜6をそのまま実装する（タグの和集合は `normalizeLabels` に全リストのタグを順に渡すと得られる）。`repairLibrary` は spec 1節「読み込み時の補正」の4項目を、この順で行う: ① `packId` のない・存在しないパックを指すリストに1リストのパック（`pack-<id>` が既にあればそれに入れる。新しいパックは `packs` の最後に、リストの順で）② リストに残った `category`・`tags` を、パックにどちらもないときだけパックへ移し、リストから `category`・`tags`・`group` を外す ③ 空のパックを捨てる ④ パック内の重なったリスト名と、重なったパック名を「（2）」…にする。`normalizeLibrary(lists, null)` は `convertLibrary`、それ以外は `repairLibrary`。名前の重なりの付け方は `workspaceDocument.ts` の `unique`・`fit` を export して使う。

`validateLibrary` は Global Constraints のパックの規則・`packId` の参照・空のパック・パック内のリスト名の重なり・リストに `group`・`category`・`tags` がないことを確かめ、違反で `Error('Invalid packs')` を投げる。

- [ ] **Step 5: 通ることを確かめる**

Run: `node --test tests/wordPacks.test.cjs tests/wordLists.test.cjs`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/core/wordPacks.ts src/core/wordLists.ts src/core/workspaceDocument.ts tests/wordPacks.test.cjs tests/fixtures/packs
git commit -m "feat: 単語パックの型と、保存データの変換・補正を追加する"
```

---

### Task 2: 画面用の形と、画面の変更の反映（TS）

**Files:**
- Modify: `src/core/wordPacks.ts`
- Test: `tests/wordPacks.test.cjs`

**Interfaces:**
- Consumes: Task 1 の `Library`・`repairLibrary`
- Produces:
  ```ts
  /** 画面が見る形: 各リストにパックの category・tags を付け、2つ以上のリストを持つパックのリストには group = パック名。packId は残す。 */
  export function viewLists(library: Library): SavedWordList[]
  /** 画面が viewLists の結果を変えたもの（追加・削除・並べ替え・編集）を、保存の形に戻す。 */
  export function applyListChange(previous: Library, lists: SavedWordList[]): Library
  ```

- [ ] **Step 1: 失敗するテストを書く**（`tests/wordPacks.test.cjs` に追加）

```js
const { viewLists, applyListChange } = require('../src/core/wordPacks.ts')
const w = [{ display: 'ls', input: 'ls', annotation: '' }]
const at = '2026-10-01T00:00:00.000Z'
const library = {
  packs: [{ id: 'p', name: 'Linux', category: 'プログラミング', tags: ['Linux'], createdAt: at }, { id: 'q', name: 'Solo', createdAt: at }],
  lists: [{ id: 'a', name: 'a', packId: 'p', levels: ['基本'], words: w, records: [], createdAt: at },
          { id: 'b', name: 'b', packId: 'p', words: w, records: [], createdAt: at },
          { id: 's', name: 'Solo', packId: 'q', words: w, records: [], createdAt: at }],
}

test('viewLists gives each list its pack labels, and a group only in a pack of two or more', () => {
  const [a, , s] = viewLists(library)
  assert.deepEqual([a.group, a.category, a.tags, a.packId], ['Linux', 'プログラミング', ['Linux'], 'p'])
  assert.equal('group' in s, false)
})

test('applyListChange puts edits back into the packs', () => {
  const view = viewLists(library)
  // ラベルの変更はパックへ。
  let next = applyListChange(library, view.map(list => list.id === 'b' ? { ...list, tags: ['Linux', 'zsh'] } : list))
  assert.deepEqual(next.packs[0].tags, ['Linux', 'zsh'])
  assert.equal(next.lists.some(list => 'tags' in list || 'group' in list || 'category' in list), false)
  // packId のない新しいリストは1リストのパックになる。
  next = applyListChange(library, [...view, { id: 'n', name: 'New', category: 'X', words: w, records: [], createdAt: at }])
  assert.deepEqual(next.packs.at(-1), { id: 'pack-n', name: 'New', category: 'X', createdAt: at })
  // 1リストだけのパックは、リストの改名についていく。
  next = applyListChange(library, view.map(list => list.id === 's' ? { ...list, name: 'Renamed' } : list))
  assert.equal(next.packs[1].name, 'Renamed')
  next = applyListChange(library, view.map(list => list.id === 'a' ? { ...list, name: 'a2' } : list))
  assert.equal(next.packs[0].name, 'Linux')
  // 最後のリストを消すとパックも消える。
  next = applyListChange(library, view.filter(list => list.id !== 's'))
  assert.deepEqual(next.packs.map(pack => pack.id), ['p'])
  validateLibrary(next)
})
```

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/wordPacks.test.cjs`
Expected: FAIL（`viewLists is not a function`）

- [ ] **Step 3: 実装する**

`applyListChange` の手順: ① 各パックについて、属するリストのうち `category`・`tags`（`normalizeLabels` 後）が `previous` のそのパックの値と違う最初のリストの値を、パックの新しい値にする ② 1リストだけのパックで、パック名が `previous` でのそのリストの名前と同じ（大文字小文字を区別しない）なら、パック名を新しいリスト名にする ③ 残りは `repairLibrary` に渡す（`packId` のないリストのパック、空のパック、名前の重なり、リストからラベルを外す）。

- [ ] **Step 4: 通ることを確かめる**

Run: `node --test tests/wordPacks.test.cjs`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/wordPacks.ts tests/wordPacks.test.cjs
git commit -m "feat: 画面用のリストの形と、画面での変更をパックへ戻す処理を追加する"
```

---

### Task 3: 文書・保存・セッションに packs を通す（TS）

**Files:**
- Modify: `src/core/workspaceDocument.ts`、`src/core/workspaceRequest.ts`、`src/core/workspaceStore.ts`、`src/core/workspaceSession.ts`、`src/plugins/storage/guest.ts`、`src/plugins/storage/cloud/client.ts`、`src/plugins/packs/index.ts`、`src/lib/useWordLists.tsx`
- Test: `tests/workspaceDocument.test.cjs`、`tests/workspaceSession.test.cjs`、`tests/guestWorkspace.test.cjs`、`tests/workspace.test.cjs`

**Interfaces:**
- Consumes: Task 1・2 の `Library`・`normalizeLibrary`・`decodePacks`・`validateLibrary`・`viewLists`・`applyListChange`
- Produces:
  ```ts
  // workspaceDocument.ts
  export type WorkspaceDocument = Library & { devices: PracticeDevice[] }      // lists は保存の形
  export type WorkspaceChange = { lists?: SavedWordList[]; packs?: WordPack[]; devices?: PracticeDevice[] }
  export function decodeDocument(value: { lists: unknown; packs?: unknown; devices: unknown; profiles?: unknown }): DecodedDocument
  //   packs が undefined・null なら未変換として normalizeLibrary(lists, null)
  // workspaceSession.ts
  export type WorkspaceSessionOptions = { ...; initialLibrary: Library; ... }   // initialLists を置き換える
  //   show() には viewLists(library) を渡す。update(change) は applyListChange(current, change(viewLists(current))) を lists と packs の両方で保存する
  // plugins/packs/index.ts
  export const initialLibrary: Library   // normalizeLibrary(initialLists, null)
  ```
- `validateWorkspaceRequest`: `packs` を受け取る（省略可。古い画面の保存）。`lists` と `packs` が両方あれば `validateLibrary`。`packs` だけは不可（`Error('Invalid request')`）。
- `applyChange`: `packs` が省略されたら保存済みの `packs` を残し、結果を `repairLibrary` で整える。
- ブラウザー保存: `{ version: 1, accountId, revision, lists, packs, devices }`。
- `cloud/client.ts`: 応答の `packs`（`null` は未変換）を `decodeDocument` と同じく読む。

- [ ] **Step 1: 失敗するテストを書く**

- `tests/workspaceDocument.test.cjs`: `decodeDocument({ lists: [groupのあるリスト], devices: [] })` の `packs` が fixture `groups.json` の期待値と同じ。`packs: []` を渡すと補正（`packId` のないリストが1リストのパック）。`applyChange(document, { lists })` で `packs` が残り、消えたリストのパックが消える。
- `tests/workspaceSession.test.cjs`: revision 0 のストアで `show` に渡る `lists` が `viewLists(initialLibrary)`（`group` 付き）。`update(lists => lists)` で `store.write` に `lists`（`packId` あり・`group` なし）と `packs` の両方が渡る。
- `tests/guestWorkspace.test.cjs`: `packs` のない v0.90.0 の形の `localStorage` を読める。書き込み後の `localStorage` の値に `packs` があり、各リストに `packId` がある。`lists` と `packs` が食い違う書き込み（存在しない `packId`）は失敗する。
- `tests/workspace.test.cjs`（`validateWorkspaceRequest`）: `packs` だけの保存は拒否、`lists` だけは受け付ける。

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/workspaceDocument.test.cjs tests/workspaceSession.test.cjs tests/guestWorkspace.test.cjs tests/workspace.test.cjs`
Expected: FAIL

- [ ] **Step 3: 実装する**

`useWordLists.tsx` は `initialLists` の代わりに `initialLibrary` を渡す。画面のコードは変えない（`lists` は `viewLists` の結果で、これまでと同じく `group`・`category`・`tags` を持つ）。`LegacyImport` の `update(..., false)` も同じ `update` を通るので変えない。

- [ ] **Step 4: 全体のテストと型を確かめる**

Run: `npm test && npm run typecheck && npm run lint`
Expected: すべて PASS（`listGroups`・`listLabels` などの既存テストも、画面用の形が同じなので変えずに通る）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: ブラウザー保存とアカウントの保存で単語パックを読み書きする"
```

---

### Task 4: Go のパック（デコード・変換・補正・反映・エンコード）

**Files:**
- Create: `server/internal/workspace/packs_library.go`、`server/internal/workspace/packs_library_test.go`
- Modify: `server/internal/workspace/workspace.go`（`List` に `PackID`・`Group`、`Workspace` に `Packs`、`rawList` が `packId`・`group` を読む、`Decode` の引数）、`server/internal/workspace/encode.go`、`server/internal/workspace/packs.go`（`Initial`）、`Decode`・`Encode` を呼ぶ各所とテスト

**Interfaces:**
- Consumes: `tests/fixtures/packs/*.json`
- Produces:
  ```go
  type Origin struct { CatalogID string `json:"catalogId"`; Version float64 `json:"version"` }
  type Pack struct {
      ID, Name, Description, Category string   // "" は保存しない
      Tags      []string
      Origin    *Origin
      CreatedAt string
      Extra     string
  }
  type Workspace struct { Lists []List; Packs []Pack; Devices []Device }
  // List に PackID string を足す。Group string は変換のためだけに読み、書かない。
  // List.Category・Tags は、デコード後はパックの値（画面用の形と同じ）。

  // packs が nil（DB の NULL）なら未変換として変換、それ以外は補正する。
  func Decode(lists, devices, packs []byte) (*Workspace, error)
  // lists の Category・Tags・PackID の変更を Packs に戻す（TS の applyListChange と同じ規則）。
  func (w *Workspace) ApplyListChange(previous *Workspace)
  func Encode(lists []List) ([]byte, error)          // packId を書き、category・tags・group を書かない
  func EncodePacks(packs []Pack) ([]byte, error)
  func CheckPacks(packs []Pack, lists []List) error  // validateLibrary と同じ。違反は &Error{Key: "invalidWorkspace"}
  ```

- [ ] **Step 1: 失敗するテストを書く**

`packs_library_test.go`:
- `TestPackFixtures`: `../../../tests/fixtures/packs/*.json` を1つずつ読み、`Decode(lists, []byte("[]"), packs)`（`packs` が JSON の `null` なら `nil`）の結果を `Encode`・`EncodePacks` で JSON にし、`expected.lists`・`expected.packs` と JSON として同じであること。
- `TestApplyListChange`: Task 2 のテストと同じ4つの場合（ラベルの変更・`PackID` のない新しいリスト・1リストのパックの改名・最後のリストの削除）。
- `TestCheckPacks`: Task 1 の `validateLibrary` のテストと同じ7つの違反。
- `TestPackExtraKept`: 知らない項目 `"future":1` を持つパックが `EncodePacks` の後も残る。

- [ ] **Step 2: 失敗を確かめる**

Run: `cd server && go test ./internal/workspace/ -run 'Pack|ApplyListChange'`
Expected: FAIL（コンパイルエラー）

- [ ] **Step 3: 実装する**

規則は Task 1・2 と同じ。名前の比較は `lowerCase`・`trimJS`、長さは `length`（UTF-16）を使う。`Initial()` は今の初期リストを `Decode(…, nil)` と同じ変換にかける。`Decode` の呼び出し元（`store`・テスト）は、`packs` 列を読むまで `nil` を渡す（Task 5 で直す）。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd server && go test ./... && go vet ./...`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add server tests/fixtures
git commit -m "feat(server): 単語パックのデコード・変換・補正を Go に追加する"
```

---

### Task 5: DB の packs 列と、Go の保存 API・リスト API

**Files:**
- Create: `prisma/migrations/0024_packs/migration.sql`
- Modify: `prisma/schema.prisma`（`packs Json? @db.JsonB`）、`server/internal/store/store.go`、`server/internal/store/store_test.go`、`server/internal/web/workspace.go`、`server/internal/web/request.go`、`server/internal/web/workspace_test.go`、リストの応答を作るところ（`overview.go` など `GET /api/v1/lists` の項目）

**Interfaces:**
- Consumes: Task 4 の `Decode`・`ApplyListChange`・`EncodePacks`・`CheckPacks`
- Produces:
  ```go
  type Saved struct { Lists, Packs, Devices json.RawMessage; Revision int }  // Packs は NULL のとき JSON の null
  type Change struct { Lists []workspace.List; Packs []workspace.Pack; Devices []workspace.Device; HasLists, HasPacks, HasDevices bool }
  ```
- web の `saved` 構造体は項目を `Lists`・`Packs`・`Devices`・`Revision`・`AccountID` の順に持つ（Kotlin も同じ順で書く）。
- `/api/workspace` の GET・PUT の応答に `"packs"`（保存した jsonb のまま。`NULL` と行がないときは `null`）。PUT は `packs` を受け取る（配列。`null` は 400 `invalidWorkspace`。`packs` だけは 400）。`lists` と `packs` が両方あれば `CheckPacks`。
- `Store.Modify`: 変更の前の `Workspace` を写しておき、変更の後に `ApplyListChange(before)` をかけ、`lists`・`packs` を両方書く。大きさの判定（`CheckSize`）は `lists` と `packs` の JSON の長さの合計で行う。
- `GET /api/v1/lists`・`GET /api/v1/lists/{l}` の各リストに `"packId"`。

- [ ] **Step 1: マイグレーションを書く**

```sql
-- 0024_packs: 単語パック。NULL はまだパック化していない保存データ（アプリと Go が読み込み時に変換する）。
ALTER TABLE "typle_workspaces" ADD COLUMN "packs" JSONB;
```

- [ ] **Step 2: 失敗するテストを書く**

- `workspace_test.go`（web）: GET の応答に `packs`（行がないとき `null`）。PUT で `packs` を保存すると次の GET で返る。`packs` が `null`・`packs` だけ・存在しない `packId` は 400 `invalidWorkspace`。`lists` だけの PUT は通り、保存済みの `packs` が残る。
- `store_test.go`（`TYPLE_TEST_DATABASE_URL` のとき）: `packs` が `NULL` の行を `Read` すると変換される。`Modify` でリストを作ると、`packs` 列にそのリストの1リストのパックが書かれる。`Modify` でリストの `Category` を変えると、パックの `category` が変わり、リストには書かれない。
- `GET /api/v1/lists` の応答のテスト: 各項目に `packId`。`category`・`tags` はパックの値。

- [ ] **Step 3: 失敗を確かめる**

Run: `cd server && go test ./internal/web/ ./internal/store/`
Expected: FAIL

- [ ] **Step 4: 実装する**

SQL は `SELECT lists::text, devices::text, packs::text …`（`packs` が NULL なら Go の `[]byte` も nil）、`UPDATE … SET packs = COALESCE($n::jsonb, packs)`、`INSERT … (owner_id, lists, devices, packs)`。

- [ ] **Step 5: DB を使うテストも含めて確かめる**

Run: `npm run db:migrate && cd server && TYPLE_TEST_DATABASE_URL="$DATABASE_URL" go test ./...`
Expected: PASS（手元に DB がなければ `docker compose up -d` で `compose.yaml` の PostgreSQL を起動してから）

- [ ] **Step 6: コミット**

```bash
git add prisma server
git commit -m "feat(server): packs 列を足し、保存 API とリスト API で単語パックを扱う"
```

---

### Task 6: typle-kotlin-backend の packs 列

**Files（`../typle-kotlin-backend`。ブランチ `feat/word-packs`）:**
- Modify: `src/main/kotlin/io/github/sparklingstadt/typle/server/workspace/Workspace.kt`、`store/Store.kt`、`web/WorkspaceRoutes.kt`
- Test: `src/test/kotlin/.../workspace/WorkspaceTest.kt`、`store/PgStoreTest.kt`、`web/WorkspaceRoutesTest.kt`

**Interfaces:**
- Consumes: Task 5 の `/api/workspace` の仕様（GET・PUT の `packs`、エラーのキー）
- Produces: `data class Saved(val lists: String, val devices: String, val packs: String?, val revision: Long)`、`data class Change(..., val packs: List<WordPack>, val hasPacks: Boolean)`、`fun decode(lists: String, devices: String, packs: String?): Workspace`

Kotlin のバックエンドは `/api/workspace` とログインだけを持ち、変換はアプリが行うので、ここでは `packs` を読み書きし、Go の `CheckPacks` と同じ検証をするだけ。

- [ ] **Step 1: 失敗するテストを書く**

`WorkspaceRoutesTest.kt` に、Task 5 の web のテストと同じ5つの場合（GET の `packs`・PUT で保存・`null` と `packs` だけと存在しない `packId` が 400・`lists` だけで `packs` が残る）。`WorkspaceTest.kt` に Task 1 の `validateLibrary` と同じ7つの違反。

- [ ] **Step 2: 失敗を確かめる**

Run: `cd ../typle-kotlin-backend && ./gradlew test`
Expected: FAIL

- [ ] **Step 3: 実装する**

応答の JSON の項目の順は、Go の `saved` 構造体と同じ `lists`・`packs`・`devices`・`revision`・`accountId`（`GoJson` で書く）。

- [ ] **Step 4: Kotlin のバックエンドで E2E を確かめる**

Run: `cd ../typle-kotlin-backend && ./gradlew test && cd ../typle-r && TYPLE_BACKEND=kotlin npm run test:e2e`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd ../typle-kotlin-backend && git add -A && git commit -m "feat: packs 列を読み書きし、単語パックを検証する（typle-r v0.91.0）"
```

---

### Task 7: 古いデータからの変換の E2E と、リリースの準備

**Files:**
- Create: `tests/e2e/packs-migration.spec.ts`
- Modify: `README.md`（先頭の変更履歴に v0.91.0）、`docs/api.md`（`/api/v1/lists` の `packId`、`category`・`tags` がパックの値になったこと）、`package.json`・`package-lock.json`（`0.91.0`）

- [ ] **Step 1: E2E を書く**

`tests/e2e/packs-migration.spec.ts`（`tests/e2e/guest.spec.ts` の `addInitScript` の書き方に合わせる）:
- `group` を持つ v0.90.0 の形（`packs` なし）のゲストのデータを入れて `/words` を開くと、v0.90.0 と同じくまとまりが1行で表示される。リストを1つ編集して保存すると、`localStorage` の値に `packs` があり、各リストに `packId` があり、`group`・`category`・`tags` がない。表示は変わらない。
- 何も保存していないゲストで `/words` の表示が v0.90.0 と同じ（初期リストのまとまりの数が `tests/listGroups.test.cjs` の 17）。
- ログインしたアカウント（`tests/e2e/account.spec.ts` のやり方）で、`packs` が `NULL` の行を読んで表示し、保存すると DB の `packs` が埋まる。

- [ ] **Step 2: 通ることを確かめる**

Run: `npm run test:e2e`
Expected: PASS（既存の `list-groups`・`list-labels`・`words` などもすべて）

- [ ] **Step 3: README・docs・バージョンを書く**

README の先頭（「## v0.90.0」の前）に「## v0.91.0 — 単語リストを単語パックに入れるようにしました（データ構造）」を書く。内容: 保存形式（`packs`・`packId`・`group`／`category`／`tags` がパックへ）、読み込み時の変換と補正、マイグレーション `0024_packs`、画面は変わらないこと、iPad・Mac・Android・Windows のアプリではリストのカテゴリ・タグ・まとめ表示が出なくなるがデータは消えないこと、typle-kotlin-backend も合わせて直したこと、初期リストのファイルは変えていないこと。`npm version 0.91.0 --no-git-tag-version`。

- [ ] **Step 4: 全体を確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && (cd server && go test ./... && go vet ./...)`
Expected: すべて PASS

- [ ] **Step 5: コミット**

```bash
git add tests/e2e/packs-migration.spec.ts README.md docs/api.md package.json package-lock.json
git commit -m "docs: v0.91.0 の単語パックのデータ構造を README と API の文書に書く"
```

リリースは `docs/release-workflow.md` の順（PR → squash merge → post-merge verify → GitHub Release → Vercel のデプロイ）。typle-kotlin-backend の PR も同じ時期にマージする。
