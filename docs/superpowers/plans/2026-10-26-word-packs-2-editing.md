# 単語パック PR 2（パックの画面と編集）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web の単語リストの管理画面をパック単位にし、パックの作成・編集（名前・説明・カテゴリ・タグ・リストの並べ替え）・削除と、リストのパック間の移動・難易度の編集をできるようにする（v0.92.0）。

**Architecture:** パックを扱う操作は保存の形（`Library`）の上の純粋な関数として `src/core/packEditing.ts` に置き、セッションに `updateLibrary` を足して画面から呼ぶ。今の `update`（画面用のリストの形）は練習・記録など、リストだけを触る画面のために残す。リストの作成・編集も `updateLibrary` と `saveListInPack` に切り替え、画面用の形のラベルがパックを書き換えないようにする。

**Tech Stack:** TypeScript（Next.js 16・React 19・next-intl・radix-ui・@dnd-kit）、`node --test`、Playwright

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（「2. 作る・編集する（Web）」と「実装の分け方」の PR 2）。前提は PR 1（v0.91.0）の `src/core/wordPacks.ts`。

## spec からの変更（この計画で決めたこと）

- **管理画面は `/edit`。** spec は「`/words` を置き換える」と書いたが、リストの管理画面は `/edit`（`/words` は単語一覧）。`/edit` をパックの画面にする。`/edit?list=<id>` でリストの編集を開く動きは残す。
- **パックの複製・書き出し・共有は PR 5・6。** spec 2節のパックの操作のうち、この PR は「練習・パックを編集・リストを追加・削除」。リストごとの複製・CSV 書き出しは今のまま残す。
- **`/create` をパックの指定なしで開いたとき**は、spec の「最後に使ったパック」ではなく、選択欄の既定を「新しいパック（リスト名で作成）」にする。今と同じく1リストのパックができる。「最後に使った」の決め方があいまいなため。
- **CSV・TSV の取り込み先のパック**は、リストの編集画面のパックの選択欄で選ぶ（取り込みはリストの編集画面の中にあるため、別の選択は作らない）。

## Global Constraints

- パック名: 前後の空白を除いて1文字以上、`MAX_PACK_NAME`（200）文字まで、ほかのパックと同じ名前は不可（前後の空白を除き `toLocaleLowerCase` で比べる）。説明: `MAX_PACK_DESCRIPTION`（500）文字まで、空なら保存しない。カテゴリ・タグは `normalizeLabels` と `MAX_CATEGORY`・`MAX_TAG`・`MAX_TAGS`。
- リスト名は同じパックの中だけで重複不可。
- `levels`: 1つ `MAX_LEVEL`（50）文字・`MAX_LEVELS`（5）段まで。前後の空白を除き、空は捨てる（`normalizeGroup` の `levels` の扱いと同じ）。
- リストの数の上限は今の `MAX_LISTS`（150）。パックに別の上限はない。
- 新しいエラーは `src/messages/*/errors.json` に足す: `packNameRequired`・`packNameDuplicate`・`packDeleted`。
- 画面の文言は6言語（`ja`・`en`・`zh-CN`・`zh-TW`・`ru`・`fr`）すべてに足す。`tests/i18n.test.cjs` がキーとプレースホルダーの一致を確かめる。
- 保存形式・API は変えない（PR 1 のまま）。
- 出力・コミットメッセージ・README は日本語（`CLAUDE.md`）。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **リストの編集で、属するパックのカテゴリ・タグが変わらない**: 編集画面にラベルの欄がなくなったリストを保存しても、パックのラベルが消えない（Task 1 の `saveListInPack` のテスト、Task 5 の E2E）。
2. **別のパックへ移したリストの名前が、移した先の既存のリストと同じ**: `listNameDuplicate` を出し、保存しない（Task 1）。
3. **パックの最後のリストを移す・消す**: 元のパックが消える（Task 1、Task 3 の確認の文言）。
4. **パック名の重なり**: 作成・改名で大文字小文字だけ違う名前も `packNameDuplicate`（Task 1）。
5. **検索がパック名・カテゴリ・タグ・中のリスト名・単語で当たり、リスト名で当たったパックは開いて表示される**（Task 3 の E2E）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/core/packEditing.ts`（新） | `packOverviews`・`matchesPackQuery`・`createPack`・`updatePack`・`reorderPackLists`・`deletePack`・`saveListInPack` |
| `tests/packEditing.test.cjs`（新） | その単体テスト |
| `src/core/listOverview.ts` | `duplicateList` を同じパックに入れる |
| `src/core/workspaceSession.ts`・`src/lib/useWordLists.tsx` | `packs` と `updateLibrary` を出す |
| `src/app/(workspace)/edit/page.tsx` | パックの一覧（`ListManager` をパック単位に） |
| `src/components/WordLists/PackRow.tsx`（新、`GroupRow.tsx` を置き換える） | パックの1行と開いた中身、パックの操作 |
| `src/components/WordLists/PackFields.tsx`（新） | パックの名前・説明・カテゴリ・タグの欄（`LabelFields` を使う） |
| `src/app/(workspace)/packs/create/page.tsx`・`packs/edit/page.tsx`（新） | パックの作成・編集の画面 |
| `src/components/PackEditor.tsx`（新） | パックの編集（欄とリストの並べ替え） |
| `src/components/WordListEditor.tsx` | パックの選択欄・難易度の欄。ラベルの欄を外す。作成画面ではパックの欄を上に出せる |
| `src/components/WordLists/LevelFields.tsx`（新） | 難易度の欄 |
| `src/app/(workspace)/create/page.tsx` | `?pack=` と `updateLibrary` |
| `src/components/Sidebar/*`・`src/messages/*/nav.json` | 「単語パック」「パックを作成」 |
| `src/messages/*/wordLists.json`・`errors.json` | 文言（6言語） |
| `tests/e2e/packs.spec.ts`（新）と既存の E2E | 画面の確認 |
| `README.md`・`package.json`・`package-lock.json` | v0.92.0 |

---

### Task 1: パックの編集の関数（core）

**Files:**
- Create: `src/core/packEditing.ts`、`tests/packEditing.test.cjs`
- Modify: `src/core/listOverview.ts`（`duplicateList`・`copyName`）、`src/core/wordLists.ts`（`saveList` の名前の重なりを同じ `packId` の中で判定）、`src/messages/*/errors.json`（3つのキー、6言語）

**Interfaces:**
- Consumes: `Library`・`WordPack`・`repairLibrary`・`viewLists`・`MAX_PACK_NAME`・`MAX_PACK_DESCRIPTION`（`src/core/wordPacks.ts`）、`ListOverview`・`listOverviews`・`MAX_LISTS`（`listOverview.ts`）、`normalizeLabels`・`validateList`（`wordLists.ts`）、`AppError`
- Produces:
  ```ts
  export type PackOverview = {
    pack: WordPack
    /** 中のリスト（画面用の形）を保存順に。 */
    lists: ListOverview[]
    /** packs の中の位置（保存順）。 */
    position: number
    wordCount: number
    practiceCount: number
    practicedListCount: number
    lastPracticed: number | null
  }
  export function packOverviews(library: Library): PackOverview[]
  /** パック名・カテゴリ・タグ・中のリスト名・単語で探す（大文字小文字を区別しない）。 */
  export function matchesPackQuery(item: PackOverview, query: string): boolean
  /** 中のリストのうち、リスト名か単語で当たったものの id（パックを開いて見せるため）。 */
  export function matchingListIds(item: PackOverview, query: string): string[]
  export type PackInput = { name: string; description?: string; category?: string; tags?: string[] }
  export function createPack(library: Library, fields: PackInput, firstList: SavedWordList, packId: string, now?: Date): Library
  export function updatePack(library: Library, packId: string, fields: PackInput): Library
  /** listIds はそのパックのリストの id をすべて、新しい順番で。 */
  export function reorderPackLists(library: Library, packId: string, listIds: string[]): Library
  export function deletePack(library: Library, packId: string): Library
  /** リストの作成・編集。packId が null なら、リスト名で1リストのパックを作る。 */
  export function saveListInPack(library: Library, list: { id: string; name: string; words: SavedWordList['words']; levels?: string[]; createdAt: string },
    packId: string | null, editing: boolean): Library
  ```
  - エラー: パック名が空 `AppError('packNameRequired')`、重なり `packNameDuplicate`、`updatePack`・`reorderPackLists`・`deletePack`・`saveListInPack` で指定のパックがない `packDeleted`、編集中のリストがない `listDeleted`、リストの数が `MAX_LISTS` を超える作成 `listLimit`（`{ max }`）、リスト名・単語の検証は `validateList` と同じキー、同じパックのリスト名の重なり `listNameDuplicate`。長さの上限を超える値は `Error('Invalid packs')`（画面の欄が上限を守るので、画面には出ない）。
  - `createPack`: パックを `packs` の最後に、リストを `lists` の最後に（`packId` 付き、`records: []`）。
  - `saveListInPack`: 編集では記録と `createdAt` を残す。パックが変わらなければ配列の位置も残し、変わったら移した先のパックの最後のリストの直後に移す。元のパックが空になれば消す（`repairLibrary` に任せる）。`levels` は `normalizeGroup` と同じく整え、空なら保存しない。
  - どの関数も結果を `repairLibrary` に通して返す。
- `duplicateList(lists, id, copyId, suffix, now)`（画面用の形の上の関数のまま）: 複製を元と同じ `packId` で `lists` の最後に足す（同じパックの最後になる）。名前の重なりは同じパックの中で判定する（`copyName` に同じパックのリストを渡す）。`levels`・ラベルは今までどおり写さない。
- `saveList`: `validateList(list, others)` の `others` を同じ `packId` のリストに限る（`packId` がなければ今までどおり全体）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/packEditing.test.cjs`（書き方は `tests/wordPacks.test.cjs` に合わせる）。fixture: パック `p`（名前 `Linux`、カテゴリ `プログラミング`、タグ `['Linux']`）にリスト `a`（名前 `基本`、記録1件）・`b`（名前 `応用`）、パック `q`（名前 `Go`）にリスト `g`（名前 `基本`）。テスト:
- `packOverviews`: `p` の `lists` が `['a','b']`、`wordCount`・`practiceCount`・`practicedListCount`（1）・`lastPracticed`。中のリストは `viewLists` の形（`category` が `プログラミング`）。
- `matchesPackQuery`: `'linux'`・`'プログラ'`・`'応用'`・単語の文字で当たる。`matchingListIds(p, '応用')` が `['b']`。
- `createPack`: 名前 `' New '` は `New` で保存。`' linux '` は `packNameDuplicate`、`' '` は `packNameRequired`。最初のリストは新しいパックの `packId` を持ち、`validateLibrary` を通る。リストが `MAX_LISTS` 件あると `listLimit`。
- `updatePack`: 名前・説明・ラベルの変更。説明 `''` は保存しない。ほかのパックと同じ名前は `packNameDuplicate`、自分の名前の大文字小文字だけの変更は通る。ないパックは `packDeleted`。
- `reorderPackLists(p, ['b','a'])`: `lists` の中で `p` のリストの位置だけが入れ替わり、`q` のリストの位置は変わらない。id の過不足は `Error('Invalid packs')`。
- `deletePack(p)`: `p` と `a`・`b` が消える。
- `saveListInPack`:
  - 編集で名前と単語を変えても `p` のカテゴリ・タグは変わらず、`a` の記録と `createdAt` が残る。
  - `b` を `q` に移すと `b` は `g` の後ろ。`a` を `q` に移すと名前 `基本` が `g` と重なって `listNameDuplicate`。
  - `g` を `p` に移すと `q` は消える（`g` の名前は `基本` なので、`a` と重なる。テストでは `g` を `基本2` に改名して移す）。
  - `packId` が `null` の作成は、リスト名のパックができる（`pack-<id>`）。
  - `levels: [' 基本 ', '', '初級']` は `['基本','初級']` で保存。
  - ないパック `packDeleted`、編集でないリスト `listDeleted`。
- `duplicateList`: 複製は `a` と同じ `packId`、名前は `p` の中で重ならない（`基本（コピー）`）。`q` に `基本（コピー）` があっても `p` の中では重ならないので同じ名前になる。
- `saveList`: 別のパックに同じ名前のリストがあっても保存できる。同じパックでは `listNameDuplicate`。

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/packEditing.test.cjs`
Expected: FAIL（`Cannot find module '../src/core/packEditing.ts'`）

- [ ] **Step 3: 実装する**

`errors.json` の3つのキーの日本語は「パック名を入力してください」「同じ名前のパックがあります」「このパックは削除されています」。ほかの5言語も同じ意味で書く。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core tests src/messages
git commit -m "feat: パックの作成・編集・並べ替え・削除と、リストのパック間の移動を core に追加する"
```

---

### Task 2: セッションと `useWordLists` に packs と updateLibrary

**Files:**
- Modify: `src/core/workspaceSession.ts`、`src/lib/useWordLists.tsx`
- Test: `tests/workspaceSession.test.cjs`

**Interfaces:**
- Consumes: `Library`・`WordPack`・`repairLibrary`（`wordPacks.ts`）
- Produces:
  - `WorkspaceShown` に `packs: WordPack[]`（revision 0 では `initialLibrary.packs`）。
  - セッションの `updateLibrary(change: (current: Library) => Library, useDefaults = true): Promise<boolean>` — `current` は保存の形（revision 0 で `useDefaults` なら `initialLibrary`）。結果を `repairLibrary` に通し、`lists`・`packs` を保存する。
  - `useWordLists()` の戻り値に `packs: WordPack[]` と `updateLibrary(change, useDefaults?)`（エラーの扱いは `update` と同じ `save` を通す）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/workspaceSession.test.cjs` に: revision 0 で `show` に渡る `packs` が `initialLibrary.packs`。`updateLibrary(library => ({ ...library, packs: library.packs.map(p => ({ ...p, name: p.name + '!' })) }))` で `store.write` に改名したパックが渡る。409 のときは今の `update` と同じく読み直す。

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/workspaceSession.test.cjs`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/workspaceSession.ts src/lib/useWordLists.tsx tests/workspaceSession.test.cjs
git commit -m "feat: 画面からパックを保存できるよう、セッションに updateLibrary を足す"
```

---

### Task 3: パックの一覧の画面（`/edit`）

**Files:**
- Create: `src/components/WordLists/PackRow.tsx`
- Delete: `src/components/WordLists/GroupRow.tsx`
- Modify: `src/app/(workspace)/edit/page.tsx`、`src/components/Sidebar/*`（ナビの項目）、`src/messages/*/wordLists.json`・`nav.json`（6言語）
- Test: `tests/e2e/packs.spec.ts`（新）、`tests/e2e/list-groups.spec.ts`・`word-lists.spec.ts`・`list-labels.spec.ts` のうちこの画面の表示を見ている部分

**Interfaces:**
- Consumes: Task 1 の `packOverviews`・`matchesPackQuery`・`matchingListIds`・`deletePack`、Task 2 の `packs`・`updateLibrary`、今の `listLabels`・`matchesFilter`・`ListRow`・`LabelFilter`・`DeleteConfirmation`
- Produces: `PackRow({ item, now, open, onToggle, highlight, disabled, onEditPack, onAddList, onDeletePack, children })`（`children` は中の `ListRow`）。行に `data-pack-id`。

画面の決めごと（spec 2節）:
- 見出しは「単語パック」。件数のバッジは今のリストの件数 `n / MAX_LISTS` のまま（上限はリストにある）。右上のボタンは「新しいパック」（`/packs/create`）。リストが `MAX_LISTS` 件のときは押せない。
- 1パックを1行（`PackRow`）。表示: 名前・`ListLabels`（パックのカテゴリ・タグ）・リスト数・合計語数・練習の状況（今の `GroupRow` と同じ）。1リストだけのパックも同じ行で、開くと1つの `ListRow`。
- 並び替え（`OrderMenu`）はパック単位: `added` は `position` の新しい順、`practiced` は `lastPracticed`、`name` はパック名、`words` は `wordCount`。
- 検索は `matchesPackQuery`。検索・絞り込み中は当たったパックをすべて開く。絞り込み（`LabelFilter`）はパックのカテゴリ・タグ（`listLabels(packs)`・`matchesFilter(pack, filter)`）。件数の表示はパックの数（「{shown}件 / 全{total}件」の文言を「パック」に）。
- 行の操作（メニュー）: 練習（今の `GroupRow` と同じく最後に練習したリスト、なければ最初のリスト）・パックを編集（`/packs/edit?pack=<id>`）・リストを追加（`/create?pack=<id>`、リストが上限ならなし）・削除。
- パックの削除の確認: タイトル「{name} を削除しますか？」、本文にリスト数と記録の数（「{lists}リストと{records}件の記録も削除されます」）、確定で `updateLibrary(library => deletePack(library, id))`。
- リストの削除（`ListRow` の削除）で、そのリストがパックの最後のリストなら、確認に「パック「{name}」も削除されます」を足す。
- ナビの「単語リスト」（`/edit`）は「単語パック」、「リストを作成」（`/create`）は「パックを作成」（`/packs/create`）。
- 開いているパック（`openGroups` → `openPacks`）は今と同じく、編集から戻ったときも開いたまま。変更したリストのパックは開く。

- [ ] **Step 1: 失敗する E2E を書く**

`tests/e2e/packs.spec.ts`（ゲストのブラウザー保存で。データの入れ方は `tests/e2e/packs-migration.spec.ts` に合わせる）:
- 一覧に `data-pack-id` の行がパックの数だけあり、1リストのパックも行になる。
- `応用` で検索すると、そのリストのパックが開いて `応用` の行が見える。カテゴリの絞り込みでパックが絞られる。
- パックのメニューの「削除」で、確認にリスト数と記録の数が出て、確定するとパックと中のリストが保存から消える（`localStorage` の `packs`・`lists` を見る）。
- 1リストのパックのリストを削除すると、確認に「パック…も削除されます」が出て、パックも消える。

既存の E2E のうち、`/edit` の「まとまり」の行（`li[data-group]`）を見ていたものは `data-pack-id` を見るように直す（確かめる内容は変えない）。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` のモバイルのメニューは、変更前から失敗するもの）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: 単語リストの画面をパックの一覧にし、パックを削除できるようにする"
```

---

### Task 4: パックの作成・編集の画面

**Files:**
- Create: `src/components/WordLists/PackFields.tsx`、`src/components/PackEditor.tsx`、`src/app/(workspace)/packs/create/page.tsx`、`src/app/(workspace)/packs/edit/page.tsx`
- Modify: `src/components/WordListEditor.tsx`（作成画面でパックの欄を上に出す `packFields?: ReactNode`）、`src/messages/*/wordLists.json`（6言語）
- Test: `tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `createPack`・`updatePack`・`reorderPackLists`、Task 2 の `updateLibrary`・`packs`、`LabelFields`（候補は `listLabels(packs)`）、`@dnd-kit`（`SortableWordRow` と同じ使い方）
- Produces:
  - `PackFields({ value: PackInput, onChange, suggestions, nameError })`: 名前（`maxLength` 200）・説明（`textarea`、`maxLength` 500）・カテゴリ・タグ。
  - `PackEditor({ pack, lists, onSave(fields, listIds), onCancel })`: `PackFields` と、中のリストの並べ替え（ドラッグとキーボード。各行にリスト名・難易度・語数）。未保存で離れるときは `WordListEditor` と同じく確認する。

画面の決めごと:
- `/packs/create`: `WordListEditor` の上に `PackFields` を出し（`packFields`）、保存で `updateLibrary(library => createPack(library, fields, list, randomId()))`。パック名のエラー（`packNameRequired`・`packNameDuplicate`）は名前の欄に出す。保存したら `/edit` に戻り、新しいパックを開いて強調する。キャンセルで `/edit`。
- `/packs/edit?pack=<id>`: 保存で `updateLibrary(library => reorderPackLists(updatePack(library, id, fields), id, listIds))`。パックがなければ「このパックは削除されています」と一覧へのリンク。
- 1リストのパックの名前を変えても、リスト名は変わらない（パック名とリスト名は別）。

- [ ] **Step 1: 失敗する E2E を書く**（`tests/e2e/packs.spec.ts` に追加）
- 「新しいパック」から、パック名 `Rust`・カテゴリ `プログラミング`・最初のリスト `基本`（単語1つ）で作ると、一覧に `Rust` の行ができ、保存に `packs` の `Rust` と `packId` 付きのリストがある。パック名を空にすると名前の欄に「パック名を入力してください」。既存のパックと同じ名前は「同じ名前のパックがあります」。
- パックの編集で名前・説明・タグを変えて保存すると一覧に反映される。リストをキーボードで並べ替えて保存すると、保存の `lists` の中の順番が変わる。
- 編集を変更したままキャンセルすると確認が出る。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` を除く）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: パックの作成と編集（名前・説明・カテゴリ・タグ・リストの並べ替え）の画面を追加する"
```

---

### Task 5: リストの編集画面のパックの選択と難易度

**Files:**
- Create: `src/components/WordLists/LevelFields.tsx`
- Modify: `src/components/WordListEditor.tsx`（パックの選択欄と難易度の欄。カテゴリ・タグの欄を外す。`onSave` に `packId`・`levels`）、`src/app/(workspace)/create/page.tsx`、`src/app/(workspace)/edit/page.tsx`（リストの編集の保存）、`src/messages/*/wordLists.json`（6言語）
- Test: `tests/e2e/packs.spec.ts`、`tests/e2e/list-labels.spec.ts`（リストの編集でラベルを付けていたテストを、パックの編集で付けるように直す）、`tests/e2e/word-editor.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `saveListInPack`、Task 2 の `packs`・`updateLibrary`
- Produces:
  - `WordListEditor` の props: `packs: WordPack[]`、`packId?: string | null`（初期の選択。`null` は「新しいパック（リスト名で作成）」）、`onSave(list, packId: string | null)`。`lists` はラベルの候補に使わなくなる（名前の重なりの表示には `errorKey` を使う今のまま）。
  - `LevelFields({ value: string[], onChange })`: 1段ずつの入力欄（`maxLength` 50）、「難易度を追加」（5段まで）、各段の削除。

画面の決めごと:
- パックの選択は `<select>`（見た目は `Input` と同じ枠）。選択肢はパック名（保存順）と、最後に「新しいパック（リスト名で作成）」。作成画面の `packFields` があるとき（`/packs/create`）は選択欄を出さない。
- `/create?pack=<id>` はそのパックを選んだ状態。`?pack` がない・そのパックがないときは「新しいパック」。
- リストの編集（`/edit?list=<id>`）は、今属しているパックを選んだ状態。保存は `updateLibrary(library => saveListInPack(library, list, packId, true))`。
- リストの作成（`/create`）の保存は `updateLibrary(library => saveListInPack(library, list, packId, false))`。保存したら `/edit` に戻り、そのリストのパックを開いて強調する。
- 未保存の判定（`snapshot`）に、パックと難易度を含める。カテゴリ・タグは外す。

- [ ] **Step 1: 失敗する E2E を書く**（`tests/e2e/packs.spec.ts` に追加）
- パックの「リストを追加」から作ったリストは、そのパックに入る（保存の `packId`）。
- リストを編集してほかのパックに移すと、一覧で移した先のパックに出て、元のパックが1リストだけだったら消える。移した先に同じ名前があると名前の欄に「同じ名前…」が出て保存されない。
- 難易度を `基本`・`初級` と入れて保存すると、練習画面のパックで「基本 › 初級」で選べる（v0.79.0 の段階的な選び方）。
- リストを編集して保存しても、そのパックのカテゴリ・タグが変わらない。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` を除く）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: リストの編集画面でパックを選び、難易度を入力できるようにする"
```

---

### Task 6: README と v0.92.0

**Files:**
- Modify: `README.md`（先頭の変更履歴に v0.92.0）、`package.json`・`package-lock.json`、ガイドの画面（`src/app/guide`）にリストの作成の説明があれば「パック」に直す（`src/messages/*/guide.json`、6言語）

- [ ] **Step 1: README・ガイド・バージョンを書く**

README の「## v0.91.0」の前に「## v0.92.0 — 単語リストの画面をパックの一覧にし、パックを作成・編集できるようにしました」。内容: 一覧がパック単位になったこと、パックの作成・編集・削除、リストの追加・パック間の移動・難易度の編集、ナビの名前、`/create` を指定なしで開いたときは1リストのパックができること（spec からの変更）、パックの複製・書き出し・共有は後の版であること。`npm version 0.92.0 --no-git-tag-version`。

- [ ] **Step 2: 全体を確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && (cd server && go test ./... && go vet ./...) && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（DB を使う Go の `TestPutListLimit` と `practice.spec.ts:257` は変更前から失敗するもの）

- [ ] **Step 3: コミット**

```bash
git add README.md package.json package-lock.json src/messages
git commit -m "docs: v0.92.0 のパックの画面を README に書く"
```

リリースは `docs/release-workflow.md` の順（PR → squash merge → verify → Release → デプロイ）。
