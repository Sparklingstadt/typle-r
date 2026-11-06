# 単語パック PR 5（パックのファイル・複製・公式パック・公開 API）Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** パックをファイルで書き出し・取り込みでき、丸ごと複製でき、公式パックのカタログから追加できるようにし、Go の公開 API（`/api/v1`）でもパックを扱えるようにする（v0.95.0）。

**Architecture:** パックのファイルの形・複製・取り込み・カタログは純粋な関数として TS（`src/core/packFile.ts`・`src/core/packCatalog.ts`）と Go（`server/internal/workspace/packfile.go`・`packs_edit.go`）に置き、ファイルの形は `tests/fixtures/pack-file/` の同じ入力と期待値で両方を確かめる。画面は PR 2 の `updateLibrary` で保存する。リンクでの共有は PR 6。

**Tech Stack:** TypeScript（Next.js 16・React 19・next-intl）、Go（`server/`）、`node --test`、Playwright

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（「4. 配布・取り込み」の共有以外、「6. API・サーバー」の公開 API、「実装の分け方」の PR 5）。前提は v0.94.0。

## spec からの変更（この計画で決めたこと）

- **公式パックの定義に `packs.json` を足さない。** 公式パックは今の初期データ（`initialLibrary`）のパックそのもので、`catalogId` はそのパックの id（`pack-<最初のリストのid>`、PR 1 の変換で決まる）、`version` は 1。初期リストのファイルは変えない（PR 1 と同じ理由）。
- **カタログの「追加済み」**は、`origin.catalogId` が同じパック、**または id が `catalogId` と同じパック**があるとき。PR 1〜4 の間に作られたアカウントの初期パックは `origin` を持たないが、id が同じなので追加済みと分かる。
- **新しいアカウントとゲストの初期パック**に `origin: { catalogId, version: 1 }` を付ける（TS の `initialLibrary` と Go の `Initial()`）。
- **公開 API のパックの作成・取り込みの最大**は保存と同じ（リストは全体で `MaxLists`、本文 1MiB）。

## Global Constraints

- パックのファイル: 名前 `<パック名>.typle-pack.json`、形 `{ "format": "typle-pack", "version": 1, "pack": { "name", "description"?, "category"?, "tags"? }, "lists": [{ "name", "levels"?, "words": [{ "display", "input", "annotation" }] }] }`。記録・ID・作成日時・`origin` は含めない。項目の順はこの順、空の任意項目は書かない、2 スペースのインデント・末尾改行。1MiB まで。
- 読めないファイル（JSON でない・`format` か `version` が違う・形が違う）は `AppError('packFileUnreadable')`（Go は `&Error{Key: "packFileUnreadable"}`）。中身の規則違反（名前・単語・難易度の重なり・上限）は保存と同じエラー。
- 取り込み・複製・カタログからの追加で、パック名が重なるときは「名前（2）」…、複製は「名前（コピー）」「名前（コピー2）」…（今の `copyName` の付け方。200 文字に収める）。新しい ID はパック・リストとも新しく作り、作成日時は今、記録は空。
- 複製は元のパックの直後に、取り込みとカタログからの追加は最後に入れる。複製は `origin` を写さない。カタログからの追加は `origin` を付ける。
- 公開 API の書き込みは `-writable` のときだけ。エラーの形・判定の順は今の `/api/v1` と同じ。
- 画面の文言は6言語。用語は ja パック、en pack、zh-CN/zh-TW 包、ru набор、fr pack。フランス語のアポストロフィは ’。
- 出力・コミットメッセージ・README・`docs/api.md` は日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **取り込んだファイルが保存の規則に反する**（同じパック内の同じ名前・難易度の重なり・単語なし・上限超え）: 何も保存せず、理由を出す（Task 1・2・4）。
2. **リストが上限（150）に近いときの取り込み・複製・追加**: `listLimit` で止め、一部だけ入れない（Task 1・4）。
3. **書き出したファイルをそのまま取り込む**: 同じ中身のパックが「名前（2）」でできる（Task 1 の往復テスト・Task 2 の E2E）。
4. **カタログから削除済みの公式パックを戻す**: 記録なしで戻り、「追加済み」になる。名前が既存のパックと重なると「（2）」（Task 3）。
5. **Go と TS のファイルの形の食い違い**: 同じ fixture で同じ文字列を書き、同じものを読む（Task 1・4）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/core/packFile.ts`（新） | `encodePackFile`・`decodePackFile`・`importPackFile`・`copyPack` |
| `src/core/packCatalog.ts`（新） | `officialPacks`・`catalogEntries`・`addOfficialPack` |
| `tests/packFile.test.cjs`・`tests/packCatalog.test.cjs`（新） | その単体テスト |
| `tests/fixtures/pack-file/*.json`（新） | ファイルの形の fixture（TS と Go が読む） |
| `src/plugins/packs/index.ts` | `initialLibrary` のパックに `origin` |
| `src/app/(workspace)/edit/page.tsx`・`src/components/WordLists/PackRow.tsx` | パックの複製・書き出し、ファイルからの取り込み |
| `src/app/(workspace)/packs/catalog/page.tsx`（新） | 公式パックのカタログ |
| `src/messages/*/wordLists.json`・`errors.json`・`nav.json` | 文言（6言語） |
| `server/internal/workspace/packfile.go`・`packs_edit.go`（新）・`packs.go` | Go のファイルの形・パックの作成/変更/削除/複製/取り込み・`Initial()` の `origin` |
| `server/internal/api/packs.go`（新）・`api.go`・`write.go` | `/api/v1/packs` のエンドポイント、リスト API の `packId`・`levels` |
| `docs/api.md` | パックの API |
| `README.md`・`package.json`・`package-lock.json`・`src/messages/*/guide.json` | v0.95.0 |

---

### Task 1: パックのファイル・複製・カタログの関数（TS core）

**Files:**
- Create: `src/core/packFile.ts`、`src/core/packCatalog.ts`、`tests/packFile.test.cjs`、`tests/packCatalog.test.cjs`、`tests/fixtures/pack-file/README.md`・`basic.json`・`full.json`
- Modify: `src/plugins/packs/index.ts`（`initialLibrary` のパックに `origin`）、`src/messages/*/errors.json`（`packFileUnreadable`、6言語）

**Interfaces:**
- Consumes: `Library`・`WordPack`・`repairLibrary`・`validateLibrary`（`wordPacks.ts`）、`createPack` の検証の仕方と `settle`（`packEditing.ts`）、`copyName`（`listOverview.ts`）、`unique`・`fit`（`workspaceDocument.ts`）、`initialLibrary`
- Produces:
  ```ts
  export type PackFile = { format: 'typle-pack'; version: 1; pack: { name: string; description?: string; category?: string; tags?: string[] };
    lists: { name: string; levels?: string[]; words: { display: string; input: string; annotation: string }[] }[] }
  export function encodePackFile(library: Library, packId: string): string   // ないパックは packDeleted
  export function decodePackFile(text: string): PackFile                     // 読めなければ packFileUnreadable
  /** ids: 新しいパックの id と、リストの数だけのリストの id。 */
  export function importPackFile(library: Library, file: PackFile, ids: { pack: string; lists: string[] }, now?: Date): Library
  export function copyPack(library: Library, packId: string, ids: { pack: string; lists: string[] }, suffix: (n: number) => string, now?: Date): Library
  // packCatalog.ts
  export type CatalogEntry = { catalogId: string; version: number; pack: WordPack; lists: SavedWordList[]; added: boolean }
  export function officialPacks(): { catalogId: string; version: number; pack: WordPack; lists: SavedWordList[] }[]
  export function catalogEntries(library: Library): CatalogEntry[]           // added: origin.catalogId か id が同じパックがある
  export function addOfficialPack(library: Library, catalogId: string, ids: { pack: string; lists: string[] }, now?: Date): Library
  ```
- どの関数も結果を `repairLibrary` と `validateLibrary` に通す（`packEditing.ts` の `settle` を export して使う）。リストの数が `MAX_LISTS` を超えるなら `listLimit`。

- [ ] **Step 1: fixture と失敗するテストを書く**
- `tests/fixtures/pack-file/basic.json`: `{ "library": { packs, lists }, "packId": "...", "file": "<encodePackFile の文字列>" }`（パックにラベルなし、リスト1つ、levels なし）。`full.json`: 説明・カテゴリ・タグ・難易度のあるリスト2つと、知らない項目・記録・`origin` を持つ保存データ（ファイルに出ないことを確かめる）。README に「Go は `server/internal/workspace/packfile_test.go` が読む」と書く。
- `tests/packFile.test.cjs`: fixture の `encodePackFile` が `file` と同じ文字列。`decodePackFile(file)` → `importPackFile` → `encodePackFile` で同じ文字列に戻る（名前は「（2）」になるのでパック名だけ違う）。`decodePackFile` が `format` 違い・`version: 2`・`lists` が配列でない・単語の `display` が数値・JSON でない、で `packFileUnreadable`。取り込みで同じパック内の同じリスト名は `listNameDuplicate`、難易度の重なりは `levelsConflict`、リストが上限を超えると `listLimit`（何も変わらない）。`copyPack` は元の直後に「名前（コピー）」、記録なし、`origin` なし、2回目は「（コピー2）」。
- `tests/packCatalog.test.cjs`: `officialPacks()` が `initialLibrary` のパックと同じ数・同じ id。`initialLibrary` のパックは `origin.catalogId === id`・`version: 1`。`origin` のないパック（PR 1〜4 のアカウント）でも id が同じなら `added: true`。削除したパックを `addOfficialPack` で戻すと記録なし・`origin` 付き・最後に入る。同じ名前のパックがあると「（2）」。

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/packFile.test.cjs tests/packCatalog.test.cjs`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: 実装する**

`packFileUnreadable` の日本語は「単語パックのファイルとして読み込めませんでした」。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS（`initialLibrary` に `origin` を足したことで既存のテストの期待値が変わるものは、`origin` を含めるように直す）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: パックのファイルの書き出し・取り込み、複製、公式パックの関数を追加する"
```

---

### Task 2: パックの複製・書き出し・ファイルからの取り込み（画面）

**Files:**
- Modify: `src/components/WordLists/PackRow.tsx`（メニューに「複製」「書き出す」）、`src/app/(workspace)/edit/page.tsx`（見出しの「ファイルから取り込む」）、`src/messages/*/wordLists.json`（6言語）
- Test: `tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `encodePackFile`・`decodePackFile`・`importPackFile`・`copyPack`、`updateLibrary`・`packs`、`randomId`、今の CSV の書き出し（`src/components/WordListExport.tsx`）のダウンロードの仕方

画面の決めごと:
- パックのメニュー（練習・パックを編集・リストを追加・**複製**・**書き出す**・削除）。複製と、取り込みはリストの数が上限なら押せない。
- 複製: `updateLibrary(library => copyPack(...))`、できたら「{name} を作成しました」と、新しいパックを開いて強調（`?pack=` と同じ）。
- 書き出し: `<パック名>.typle-pack.json` をダウンロード（ファイル名に使えない文字は今の CSV と同じ扱い）。
- 取り込み: 見出しの「ファイルから取り込む」で `.json` を選ぶ（`input type="file" accept=".json,application/json"`）。1MiB を超える・読めないファイルは画面にエラー（`packFileUnreadable`）を出し、保存しない。読めたら `importPackFile` で保存し、新しいパックを開いて強調。

- [ ] **Step 1: 失敗する E2E を書く**
- パックの「複製」で「名前（コピー）」のパックが元の直後にでき、保存の `packs` に入る。
- パックの「書き出す」でダウンロードされたファイルの中身が `format: "typle-pack"` で、リスト名と単語を含み、記録を含まない（Playwright の `download`）。
- そのファイルを「ファイルから取り込む」で選ぶと「名前（2）」のパックができる。
- 中身が壊れたファイルを選ぶと「単語パックのファイルとして読み込めませんでした」が出て、パックは増えない。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` は負荷でたまに落ちるもの）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: パックの複製・ファイルへの書き出し・ファイルからの取り込みを画面に追加する"
```

---

### Task 3: 公式パックのカタログ（`/packs/catalog`）

**Files:**
- Create: `src/app/(workspace)/packs/catalog/page.tsx`
- Modify: `src/app/(workspace)/edit/page.tsx`（見出しに「公式パック」へのリンク）、`src/messages/*/wordLists.json`（6言語）
- Test: `tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `catalogEntries`・`addOfficialPack`、`updateLibrary`・`packs`・`lists`、`ListLabels`、`randomId`

画面の決めごと（spec 4節）:
- 見出し「公式パック」と説明。全公式パックをカードか行で並べる: パック名・カテゴリ・タグ・リスト数・合計語数。
- 追加済みは「追加済み」（押せない）と、そのパックを `/edit?pack=<id>` で開くリンク。持っていないものは「追加」。追加したら「{name} を追加しました」と、`/edit?pack=<新しい id>` へ。
- リストが上限のときは「追加」を押せず、理由を出す。
- ゲストでも使える。

- [ ] **Step 1: 失敗する E2E を書く**
- 初期データのゲストで `/packs/catalog` を開くと、すべて「追加済み」。
- 公式パックを1つ `/edit` で削除してからカタログを開くと、そのパックが「追加」になり、押すと `/edit?pack=` に戻ってそのパックが出る。カタログに戻ると「追加済み」。
- 削除したパックと同じ名前の自作パックがあると、追加したパックは「名前（2）」。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: 公式パックのカタログの画面を追加する"
```

---

### Task 4: Go のパックの操作とファイルの形

**Files:**
- Create: `server/internal/workspace/packfile.go`・`packfile_test.go`・`packs_edit.go`・`packs_edit_test.go`
- Modify: `server/internal/workspace/packs.go`（`Initial()` のパックに `Origin`）、`lists.go`（`ListInput` に `PackID`・`Levels`）

**Interfaces:**
- Consumes: `Workspace`・`Pack`・`List`・`CheckPacks`・`repairLibrary`・`convertLibrary`（`packs_library.go`）、`CreateList`・`UpdateList`・`CopyList`、`tests/fixtures/pack-file/*.json`
- Produces:
  ```go
  type PackFile struct { /* format, version, pack{name, description, category, tags}, lists[{name, levels, words}] */ }
  func EncodePackFile(w *Workspace, packID string) ([]byte, error)          // TS の encodePackFile と同じ文字列
  func DecodePackFile(data []byte) (*PackFile, error)                        // packFileUnreadable
  func ImportPack(w *Workspace, file *PackFile, packID string, listIDs []string, now time.Time) (*Pack, error)
  func CopyPack(w *Workspace, sourceID string, name *string, packID string, listIDs []string, now time.Time) (*Pack, error)
  type PackInput struct { Name *string; Description *string; Category *string; Tags *[]string; ListOrder *[]string; Lists []PackListInput }
  func CreatePack(w *Workspace, input PackInput, packID string, listIDs []string, now time.Time) (*Pack, error)
  func UpdatePack(w *Workspace, id string, input PackInput) (*Pack, error)
  func DeletePack(w *Workspace, id string) error
  ```
- `ListInput` に `PackID *string`・`Levels *[]string`。`CreateList` で `PackID` を指定したら、そのパックの最後に入れる（`Category`・`Tags` も指定したら `invalidList`）。省略は今までどおり1リストのパック。`UpdateList` の `PackID` で移す（移った先の最後、名前の重なりは `listNameDuplicate`、難易度の重なりは `levelsConflict`）。`Levels` は TS の `tidyLevels` と同じ整え方。
- エラーのキーは TS と同じ（`packNameRequired`・`packNameDuplicate`・`packNotFound`（API 用。TS の `packDeleted` に当たる）・`listLimit`・`levelsConflict`・`packFileUnreadable`）。`packNotFound` は 404。

- [ ] **Step 1: 失敗するテストを書く**
- `packfile_test.go`: `tests/fixtures/pack-file/*.json` の `library` を読み込み、`EncodePackFile` が `file` と同じバイト列。`DecodePackFile(file)` → `ImportPack` → `EncodePackFile` の往復。Task 1 と同じ読めないファイルの5つの場合。
- `packs_edit_test.go`: Task 1 の取り込み・複製のテストと同じ場合、`CreatePack`（名前なし・重なり・リストなし）、`UpdatePack`（`ListOrder` の並べ替え・知らない id は無視して足りない id は後ろ）、`DeletePack`、`CreateList` の `PackID`・`Levels`、`UpdateList` の `PackID` での移動、`Initial()` のパックの `Origin`。

- [ ] **Step 2: 失敗を確かめる**

Run: `cd server && go test ./internal/workspace/`
Expected: FAIL（コンパイルエラー）

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `cd server && go test ./... && go vet ./... && gofmt -l .`
Expected: PASS、`gofmt` は何も出さない（DB を使うテストは `TYPLE_TEST_DATABASE_URL` なしではスキップ）

- [ ] **Step 5: コミット**

```bash
git add server tests/fixtures
git commit -m "feat(server): パックの作成・変更・削除・複製・ファイルの取り込みを Go に追加する"
```

---

### Task 5: 公開 API のパック（`/api/v1/packs`）と docs

**Files:**
- Create: `server/internal/api/packs.go`、`server/internal/api/packs_test.go`
- Modify: `server/internal/api/api.go`（ルート、リストの応答の `levels`）、`write.go`（`createList`・`updateList` の本文に `packId`・`levels`、`importList` の `packId` クエリ）、`docs/api.md`

**Interfaces:**
- Consumes: Task 4 の関数
- Produces（spec 6節の表のとおり）:
  - `GET /api/v1/packs`: 各パック `{ id, name, description, category, tags, origin, createdAt, listCount, wordCount, practiceCount, practicedListCount, lastPracticed }`（`description`・`category`・`origin` はないとき `null`、`tags` は空配列）。`category`・`tag`・`q` で絞り込み（`q` はパック名・リスト名）。
  - `GET /api/v1/packs/{packId}`: 上の項目と `lists`（`GET /api/v1/lists` の各項目と同じ形）を保存順で。
  - `GET /api/v1/packs/{packId}/export`: パックのファイル（`Content-Type: application/json`、`Content-Disposition: attachment` で今の `words.csv` と同じファイル名の扱い）。
  - 書き込み（`-writable`）: `POST /api/v1/packs`（`{ name, description?, category?, tags?, lists: [{ name, levels?, words }] }` → `201 { pack }`）、`PATCH /api/v1/packs/{packId}`（`{ name?, description?, category?, tags?, listOrder? }`、少なくとも1つ → `200 { pack }`）、`DELETE /api/v1/packs/{packId}` → `204`、`POST /api/v1/packs/{packId}/copy`（本文なしか `{ name? }` → `201 { pack }`）、`POST /api/v1/packs/import`（パックのファイルそのもの、`Content-Type: application/json` → `201 { pack }`）。`pack` は `GET /api/v1/packs/{packId}` と同じ形。
  - リスト API: `POST /api/v1/lists` の `packId`・`levels`、`PATCH /api/v1/lists/{listId}` の `packId`・`levels`、`POST /api/v1/lists/import?packId=` 。リストの応答に `levels`（ないとき空配列）。

- [ ] **Step 1: 失敗するテストを書く**（`packs_test.go`、今の `api_test.go`・`write_test.go` の書き方で）
- 読み取りの3つ（絞り込み・ないパックの 404 `packNotFound`・export のヘッダーと本文が `EncodePackFile` と同じ）。
- 書き込みの5つと、読み取り専用で 405。不正な本文 400 `invalidJson`、規則違反は 400 と各キー。
- リスト API の `packId`・`levels`（作成・移動・`packId` と `category` の同時指定は 400 `invalidList`）。

- [ ] **Step 2: 失敗を確かめる**

Run: `cd server && go test ./internal/api/`
Expected: FAIL

- [ ] **Step 3: 実装する**

`docs/api.md` に「パック」の節（上の表と検証の規則）と、リスト API の追加（`packId`・`levels`）を書く。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd server && TYPLE_TEST_DATABASE_URL='<テスト用DB>' go test ./... && go vet ./... && gofmt -l .`
Expected: PASS（`TestPutListLimit` は変更前から失敗するもの）

- [ ] **Step 5: コミット**

```bash
git add server docs/api.md
git commit -m "feat(server): 公開 API にパックのエンドポイントを追加し、リスト API で packId と levels を扱う"
```

---

### Task 6: README・ガイドと v0.95.0

**Files:**
- Modify: `README.md`（「## v0.94.0」の前に v0.95.0）、`package.json`・`package-lock.json`、`src/messages/*/guide.json`（パックの複製・書き出し・取り込み・公式パックの説明、6言語）

- [ ] **Step 1: 書く**

README「## v0.95.0 — パックの書き出し・取り込み・複製と、公式パックのカタログを追加しました」: ファイルの形、複製、取り込み、カタログ（追加済みの判定）、初期パックの `origin`、公開 API のパック、spec からの変更（`packs.json` を足さない、`catalogId` はパックの id）。`npm version 0.95.0 --no-git-tag-version`。

- [ ] **Step 2: 全体を確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && (cd server && go test ./... && go vet ./...) && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add README.md package.json package-lock.json src/messages
git commit -m "docs: v0.95.0 のパックのファイル・複製・公式パック・公開 API を README とガイドに書く"
```

リリースは `docs/release-workflow.md` の順（PR → squash merge → verify → Release → デプロイ）。
