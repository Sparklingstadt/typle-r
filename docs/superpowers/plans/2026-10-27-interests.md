# 関心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定に「関心」（親子のチップで複数選択）を足し、アカウント（ゲストはブラウザー）に保存し、公式パックのカタログで関心に合うパックを先に出す。

**Architecture:** 選択肢・判定・選択の規則は `src/core/interests.ts` に置く。保存は `typle_workspaces.interests`（JSONB）と、ワークスペースの保存形式の `interests`。Go はこの列を読み書きと検証だけ行い、`Workspace` の変換には混ぜない。画面は `/interests` と、カタログの分割表示。

**Tech Stack:** Next.js 16・React 19・next-intl・TypeScript（`node --test` + `tests/register.cjs`）・Go・Prisma（マイグレーションは SQL ファイル）・Playwright。

**Spec:** `docs/superpowers/specs/2026-10-27-interests-design.md`

## Global Constraints

- 親 ID: `language`（カテゴリ「語学」）・`programming`（カテゴリ「プログラミング」）。子 ID は `<親>/<短い名前>`、タグは仕様書の表のとおり
- 保存する配列は選択肢の順に並べ、知らない ID は消さずに残す（並びは既知の ID の後ろに、元の順で）
- 検証: 文字列の配列、50 個まで、1 つ 1〜50 文字（UTF-16）、重複なし。違反は TS は `AppError('savedDataCorrupted')`（読み込み）/ リクエストは既存の不正な本文と同じエラー、Go の `PUT /api/workspace` は既存の `errInvalid`（400）
- 未設定（NULL・項目なし）は `[]`
- `src/core` は `src/plugins` を import しない
- 文言は 6 言語（`src/messages/{en,fr,ja,ru,zh-CN,zh-TW}`）すべてに入れる
- バージョン: `0.99.0`（`package.json`・`package-lock.json`）
- コード中のコメントは英語、周りの書き方に合わせる

## Review Focus

- 関心を保存したあと、リストや端末の保存（`interests` を送らない保存）で関心が消えない → Task 2 のセッションテスト、Task 3 の store テスト
- 古いアプリ（`interests` を知らない）が `PUT /api/workspace` で保存しても関心が残る → Task 3 の web テスト
- 親を外したら子も保存から消える → Task 1 のテスト
- 知らない ID が入った保存データを読み、関心を変えて保存しても知らない ID が残る → Task 1・Task 3
- ゲストで選んだ関心が再読み込み後も残る → Task 4 の E2E

---

### Task 1: 選択肢・判定・選択の規則（TS コア）

**Files:**
- Create: `src/core/interests.ts`
- Test: `tests/interests.test.cjs`

**Interfaces:**
- Produces:
  - `export type InterestOption = { id: string; category: string; children: { id: string; tag: string }[] }`
  - `export const INTEREST_OPTIONS: InterestOption[]`（仕様書の表の順）
  - `export const MAX_INTERESTS = 50`, `export const MAX_INTEREST_LENGTH = 50`
  - `export function decodeInterests(value: unknown): string[]` — `undefined`/`null` は `[]`。形が違えば `AppError('savedDataCorrupted')`
  - `export function toggleInterest(interests: string[], id: string): string[]` — 選ぶ/外す。親を外すとその子も外す。子は親が選ばれていなければ何もしない。結果は `normalizeInterests` 済み
  - `export function normalizeInterests(interests: string[]): string[]` — 既知の ID を選択肢の順に、知らない ID をその後ろに元の順で、重複なし
  - `export function matchesInterests(pack: Pick<WordPack, 'category' | 'tags'>, interests: string[]): boolean` — 仕様書「判定」のとおり。比べるときは前後の空白を除き `toLocaleLowerCase`

- [ ] **Step 1: 失敗するテストを書く** — `matchesInterests`: `['language']` で語学の中国語パックが合い、プログラミングのパックは合わない／`['language','language/zh']` で中国語タグのパックが合い、タグなしの語学パックは合わない／`['programming','programming/go']` で `tags: ['go']`（小文字）が合う／`[]` は何も合わない。`toggleInterest`: `[]`→`language`→`['language']`、子 `language/ru` を足すと `['language','language/ru']`、`language` を外すと `[]`、親なしで子を押すと変化なし、知らない ID `x/y` は外さずに後ろに残る。`decodeInterests`: `null`→`[]`、`['a', 1]`・51 個・51 文字・重複・`''` は `savedDataCorrupted`
- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/interests.test.cjs` Expected: FAIL（module not found）
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `node --test tests/interests.test.cjs && npm run typecheck` Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: interest options, matching and toggling"`

### Task 2: 保存形式（TS：ドキュメント・リクエスト・ゲスト・クラウド・セッション）

**Files:**
- Modify: `src/core/workspaceDocument.ts`（`WorkspaceDocument` に `interests: string[]`、`WorkspaceChange` に `interests?: string[]`、`decodeDocument` が `value.interests` を `decodeInterests` で読む、`applyChange` が `change.interests ?? document.interests`）
- Modify: `src/core/workspaceRequest.ts`（`body.interests` があれば `decodeInterests`、違反は既存の不正な本文と同じく throw）
- Modify: `src/plugins/storage/guest.ts`（保存・読み込みに `interests`）
- Modify: `src/plugins/storage/cloud/client.ts`（応答の `interests` を `decodeDocument` に渡す。書き込みで `interests` を送る）
- Modify: `src/core/workspaceSession.ts`（`WorkspaceShown` に `interests`、`updateInterests(change: (current: string[]) => string[])` を足す。送るのは `{ interests }` だけ）
- Modify: `src/lib/useWordLists.tsx`（`interests` と `updateInterests` を返す）
- Test: `tests/workspaceDocument.test.cjs`、`tests/guestWorkspace.test.cjs`、`tests/workspaceSession.test.cjs`

**Interfaces:**
- Consumes: Task 1 の `decodeInterests`
- Produces: `useWordLists()` の `interests: string[]` と `updateInterests(change: (current: string[]) => string[]): Promise<boolean>`

- [ ] **Step 1: 失敗するテストを書く** — `decodeDocument` が `interests` なし・`null` を `[]` に読む／`applyChange` で `interests` を送らない変更は保存済みの関心を残す／ゲストで `updateInterests` 後に読み直すと残る／セッションの `updateInterests` が `{ interests, revision, accountId }` だけを書く（`lists` を送らない）
- [ ] **Step 2: 失敗を確かめる** — Run: `npm test` Expected: 新しいテストが FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `npm test && npm run typecheck && npm run lint` Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: save interests with the workspace"`

### Task 3: DB の列と Go

**Files:**
- Create: `prisma/migrations/0026_interests/migration.sql`（`-- 0026_interests: 関心。NULL は未設定（空）。` と `ALTER TABLE "typle_workspaces" ADD COLUMN "interests" JSONB;`）
- Modify: `prisma/schema.prisma`（`interests Json? @db.JsonB`）
- Create: `server/internal/workspace/interests.go`（`func DecodeInterests(data []byte) ([]string, error)`: nil・`null` は空、検証は Global Constraints と同じ。`func EncodeInterests([]string) ([]byte, error)`）
- Modify: `server/internal/store/store.go`（`Saved` に `Interests json.RawMessage`、`Change` に `Interests []string` と `HasInterests bool`。読み出しの SELECT に `COALESCE(interests, '[]'::jsonb)::text`、書き込みは `HasInterests` のときだけ列を更新（INSERT では渡す））
- Modify: `server/internal/web/request.go`（`interests` を受け付けて `DecodeInterests` で検証。`interests` だけの本文も変更として扱う）
- Modify: `server/internal/web/workspace.go`（GET・PUT の応答に `interests`。初期状態は `[]`）
- Test: `server/internal/workspace/interests_test.go`、`server/internal/store/store_test.go`、`server/internal/web/*_test.go`

**Interfaces:**
- Consumes: なし（TS と同じ規則を Go で持つ）
- Produces: `GET /api/workspace` の応答 `{ …, "interests": string[] }`、`PUT /api/workspace` の本文の任意項目 `interests`

- [ ] **Step 1: 失敗するテストを書く** — `DecodeInterests`: 空・`null`→空、`["a",1]`・51 個・51 文字・重複・`""` はエラー／store: `interests` を保存→読み出しで同じ、`interests` なしの変更（リストだけ）で列が変わらない、未保存の行は `[]`／web: `PUT` に `{"revision":n,"interests":["language"]}` だけでも保存され応答に出る、`interests` が不正なら 400、古い形の本文（`interests` なし）で関心が残る
- [ ] **Step 2: 失敗を確かめる** — Run: `go test ./server/...` Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `go vet ./... && go test ./server/...`（DB テストは `TYPLE_TEST_DATABASE_URL` を設定して流す）Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(go): store interests in a column of their own"`

### Task 4: 画面（関心のページ・サイドバー・カタログ）とリリース準備

**Files:**
- Create: `src/app/(workspace)/interests/page.tsx`、`src/components/Settings/InterestSettings.tsx`
- Create: `src/messages/{en,fr,ja,ru,zh-CN,zh-TW}/interests.json`（見出し・説明・親子の表示名・保存エラー）と、それを読む設定（`src/i18n/messages.ts` など、既存の名前空間の登録に倣う）
- Modify: `src/components/Sidebar/navigation.ts`（`settings` グループの「一般」と「端末」の間に `{ name: "interests", path: "/interests", icon: Sparkles }`）と `src/messages/*/nav.json`（`links.interests`: ja「関心」）
- Modify: `src/app/(workspace)/packs/catalog/page.tsx`（関心があるとき「関心に合うパック」「そのほかのパック」に分ける。合うものがないとき ja「関心に合うパックはまだありません」。見出しの横に `/interests` へのリンク ja「関心を変える」）と `src/messages/*/wordLists.json`
- Create: `tests/e2e/interests.spec.ts`
- Modify: `package.json`・`package-lock.json`（0.99.0）

**Interfaces:**
- Consumes: Task 1 の `INTEREST_OPTIONS`・`toggleInterest`・`matchesInterests`、Task 2 の `useWordLists().interests`・`updateInterests`

ja の文言（ほかの 5 言語は自然な訳）: 見出し「関心」、説明「選んだ関心に合う公式パックを、公式パックの一覧で先に表示します。」、親「語学」「プログラミング」、子「中国語」「ロシア語」「韓国語」「英語」「スペイン語」「フランス語」「ドイツ語」「Go」「Kotlin」「Java」「TypeScript」「PHP」「Ruby」「SQL」「Linux」「Vim」「テスト」、カタログ見出し「関心に合うパック」「そのほかのパック」。

- [ ] **Step 1: E2E を書く**（ゲスト）— サイドバーの「関心」で `/interests` → 「語学」を押すと子のチップが出る（`aria-pressed="true"`）→「中国語」を押す → 再読み込みしても両方 `aria-pressed="true"` → `/packs/catalog` の「関心に合うパック」の中に中国語のパックがあり、「そのほかのパック」に Go構文がある →「語学」を外すと「中国語」のチップが消える。アカウントで同じ選択が再読み込み後も残ることも 1 本
- [ ] **Step 2: 失敗を確かめる** — Run: `npx playwright test tests/e2e/interests.spec.ts` Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: バージョンを上げる** — Run: `npm version 0.99.0 --no-git-tag-version`
- [ ] **Step 5: 全部確かめる** — Run: `npm run lint && npm run typecheck && npm test && go test ./server/... && npm run build && npx playwright test tests/e2e/interests.spec.ts tests/e2e/packs.spec.ts tests/e2e/follow.spec.ts` Expected: PASS
- [ ] **Step 6: Commit** — `git commit -m "feat: choose interests and see matching official packs first (v0.99.0)"`
