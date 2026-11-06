# ギャラリー 2: 載せる・通報・非公開化 Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 持ち主が共有ダイアログからパックをギャラリーに載せられ、閲覧者が `/shared/<id>` から通報でき、管理者が `/admin` で非公開にできるようにする。

**Architecture:** PR 1（`docs/superpowers/plans/archive/2026-11-02-gallery-1-browse.md`、v2.7.0）の列と表を使う。通報は `typle_gallery_reports` に理由だけを入れる。非公開は `typle_shared_packs.hidden_at` で、PR 1 の一覧・`/api/shared`・`PUT /api/shares` はすでにこれを見ている。画面の「載せる」スイッチはこの PR で初めて出す。

**Tech Stack:** Go（`server/internal/store`・`web`、pgx）、PostgreSQL、Next.js 16 / React 19 / next-intl、node:test、Playwright

**Spec:** `docs/superpowers/specs/2026-11-02-gallery-design.md`

## Global Constraints

- PR 1 がマージされ、v2.7.0 が出てから始める。
- バージョンは v2.8.0（`package.json`・`package-lock.json`）。`npm version` の前に `git tag` と GitHub Releases を見て、使われていればさらに上げる。
- PR とコミットのタイトルは日本語の1文に ` (v2.8.0)`。接頭辞なし。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- Next.js 固有のコードを書く前に `node_modules/next/dist/docs/` の該当部分を読む（AGENTS.md）。
- 文言は6ロケールすべてに同じキー・同じプレースホルダー（`tests/i18n.test.cjs`）。用語は PR 1 と同じ（ja ギャラリー、en gallery、zh-CN 图库、zh-TW 圖庫、ru галерея、fr galerie）。
- 通報の理由は `inappropriate`・`spam`・`personalInfo`・`other` の4つだけ。通報者のアカウント・IP などは保存しない。
- 通報・追加数の連打はコードで防がず、Vercel Firewall のレート制限で抑える（README に一文）。
- ギャラリーの API の応答には `X-Robots-Tag: noindex` と `Cache-Control: no-store`（PR 1 と同じ）。
- `/api/admin/*` は `allowAdmin`（`server/internal/web/admin.go`）で確かめる。POST は `adminSignout` と同じく同じ Origin を確かめる。

## Review Focus

- 非公開にされたパックの持ち主が「共有を更新」「共有をやめる」はでき、スイッチだけ押せない → Task 4 の E2E。
- 管理者が非公開にした共有を「戻す」と、掲載中なら一覧に戻る（`listed_at` は消さない） → Task 1 の `TestSetHiddenKeepsListing`。
- 通報後に持ち主が共有をやめると通報も消え、管理者の一覧に残らない → Task 1 の `TestReportsGoWithShare`。
- 掲載していない（リンクだけの）共有の `/shared/<id>` から通報すると `404 notInGallery` になり、画面は「共有は終了しました」ではなく「ギャラリーに載っていないパックは通報できません。」と出す → Task 3 の E2E。
- 持ち主が掲載のスイッチを素早く2回押しても、最後の状態が保存と表示で一致する → Task 4 でスイッチを要求中は押せなくする。

---

### Task 1: 通報と非公開化（store）

**Files:**
- Modify: `server/internal/store/gallery.go`
- Test: `server/internal/store/gallery_test.go`

**Interfaces:**
- Produces:

```go
var ReportReasons = []string{"inappropriate", "spam", "personalInfo", "other"}

// Report records a report of a listed, unhidden share. It returns false when there is no such share
// (or id is not a UUID); reason is checked by the caller.
func (s *Store) Report(ctx context.Context, id, reason string) (bool, error)

type AdminGalleryPack struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Category  string         `json:"category,omitempty"`
	Added     int            `json:"added"`
	ListedAt  *time.Time     `json:"listedAt"`
	HiddenAt  *time.Time     `json:"hiddenAt"`
	Reports   int            `json:"reports"`
	Reasons   map[string]int `json:"reasons"`
}

const AdminGalleryRows = 100

// AdminGallery lists listed or hidden shares, the most reported first, then the most recent report, then listed_at.
func (s *Store) AdminGallery(ctx context.Context) ([]AdminGalleryPack, error)

// SetHidden sets or clears hidden_at. It returns false when there is no share with the id.
func (s *Store) SetHidden(ctx context.Context, id string, hidden bool) (bool, error)
```

`SetHidden(…, true)` は `hidden_at = COALESCE(hidden_at, now())`（2度押しても最初の日時）。`listed_at` には触れない。`Reasons` は通報のない行でも `{}`。

- [ ] **Step 1: 失敗するテストを書く**

```go
func TestReport(t *testing.T)                 // 掲載中 → true と行が1つ; 未掲載・非公開・存在しない UUID・"x" → false、行は増えない
func TestReportsGoWithShare(t *testing.T)     // 通報後に DeleteShare → typle_gallery_reports の行が0
func TestAdminGallery(t *testing.T)           // 通報3件の共有が通報1件の共有より先; Reasons の内訳; 未掲載で非公開でない共有は出ない; 非公開は出る
func TestSetHidden(t *testing.T)              // true → Gallery と SharedPack から消える; もう一度 true で hidden_at は変わらない; false → 戻る; 存在しない id → false
func TestSetHiddenKeepsListing(t *testing.T)  // 掲載中を非公開→戻す → listed_at が元のまま、Gallery に戻る
```

- [ ] **Step 2:** `go test ./server/internal/store -run 'Report|AdminGallery|SetHidden'`。Expected: コンパイルエラー。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `go test ./server/internal/store`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 2: 通報と管理者の API（web）

**Files:**
- Modify: `server/internal/web/gallery.go`、`server/internal/web/admin.go`、`server/internal/web/web.go`（`Store` に Task 1 の3メソッド、`mux` に `/api/gallery/reports`・`/api/admin/gallery`・`/api/admin/gallery/hide`・`/api/admin/gallery/unhide`）
- Test: `server/internal/web/gallery_test.go`、`server/internal/web/admin_test.go`

**Interfaces:**
- Consumes: Task 1
- Produces（仕様の「API」の節のとおり）:
  - `POST /api/gallery/reports` 本文 `{"id","reason"}` → `204` / `404 notInGallery`（掲載中で非公開でない共有がない）/ `400 invalidReport` / `403 forbiddenRequest`（Origin か `Content-Type` が違う）
  - `GET /api/admin/gallery` → `{"packs":[AdminGalleryPack...]}`
  - `POST /api/admin/gallery/hide`・`unhide` 本文 `{"id"}` → `204` / `404 sharedPackNotFound` / `400 invalidRequest`（新しいエラーコード。文言は Task 5 で足す）

`vercel.json`・`next.config.mjs` は PR 1 の `/api/gallery/:path*` と既存の `/api/admin/:path*` で足りる。`/api/gallery/reports` は Origin の確認に `AUTH_URL` が要るので通常のハンドラー（`Public` に入れない）。

- [ ] **Step 1: 失敗するテストを書く**

```go
func TestGalleryReport(t *testing.T)        // 正しい要求 → 204 と fake に id・reason; reason "bad"・メンバー不足・未知のメンバー → 400 invalidReport;
                                            // fake が false → 404 notInGallery; 別の Origin → 403; text/plain → 403; GET → 405
func TestAdminGalleryRefused(t *testing.T)  // cookie なし → 401 adminRequired; typle_admins にない → 403 adminForbidden（3つのパスすべて）
func TestAdminGallery(t *testing.T)         // 一覧の形; hide・unhide が fake に id と true/false を渡して 204; fake が false → 404; 別の Origin → 403
```

- [ ] **Step 2:** `go test ./server/internal/web -run 'GalleryReport|AdminGallery'`。Expected: FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `go test ./server/...`・`node --test tests/backendPaths.test.cjs`・`gofmt -l .`・`go vet ./...`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 3: `/shared/<id>` の通報

**Files:**
- Create: `src/components/Gallery/ReportDialog.tsx`
- Modify: `src/app/shared/[id]/page.tsx`（ヘッダーのボタンの並びに「通報」）、`src/messages/*/wordLists.json`（`wordLists.report.*`）、`src/messages/*/errors.json`（`invalidReport`・`notInGallery`）
- Test: `tests/e2e/gallery.spec.ts`

**Interfaces:**
- Consumes: Task 2 の `POST /api/gallery/reports`
- Produces: 文言のキー `wordLists.report.open`・`title`・`description`・`reasons.inappropriate`・`reasons.spam`・`reasons.personalInfo`・`reasons.other`・`send`・`sent`・`failed`、`errors.invalidReport`（「通報の内容が正しくありません。」）・`errors.notInGallery`（「ギャラリーに載っていないパックは通報できません。」）

理由はラジオボタンで、選ぶまで「送る」を押せない。送ったらダイアログを閉じ、ページに `role="status"` で「通報を受け付けました」。失敗はダイアログ内に `role="alert"` で `useErrorText` の文言。

- [ ] **Step 1: 失敗する E2E を書く**

```ts
test('a guest reports a pack in the gallery and an administrator sees it')
// 持ち主が listed で共有 → ゲストが /shared/<id> で「通報」→「スパム・宣伝」→「送る」→「通報を受け付けました」
// withDatabase で typle_gallery_reports に reason 'spam' の行が1つ
test('reporting a pack that is only shared by link says it failed')
// listed なしで共有 → 通報 → ダイアログに「ギャラリーに載っていないパックは通報できません。」、行は増えない
```

- [ ] **Step 2:** `npx playwright test tests/e2e/gallery.spec.ts`。Expected: FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npx playwright test tests/e2e/gallery.spec.ts`・`npm test`・`npm run lint`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 4: 共有ダイアログの「ギャラリーに載せる」とバッジ

**Files:**
- Modify: `src/lib/useShares.ts`、`src/components/WordLists/ShareDialog.tsx`、`src/components/WordLists/PackRow.tsx`、`src/app/(workspace)/edit/page.tsx`（`ShareDialog` に渡すもの、行の `listed`・`hidden`）、`src/messages/*/wordLists.json`（`wordLists.share.*` に追加）、`src/messages/*/errors.json`（`sharedPackHidden`）
- Test: `tests/e2e/gallery.spec.ts`、`tests/e2e/shares.spec.ts`（既存のテストが壊れないこと）

**Interfaces:**
- Consumes: PR 1 の `PUT /api/shares` の `listed`、`GET /api/shares` の `listed`・`hidden`
- Produces:
  - `type Share = { id: string; name: string; listed: boolean; hidden: boolean; updatedAt: string }`
  - `share(packId: string, listed?: boolean): Promise<Share>` — `listed` が `undefined` なら本文に入れない
  - `SHARE_ERRORS` に `sharedPackHidden`
  - `ShareDialog` の `onShare: (packId: string, listed?: boolean) => Promise<unknown>`
  - `PackRow` に `listed?: boolean`・`hidden?: boolean`
  - 文言のキー `wordLists.share.gallery`（スイッチのラベル）・`galleryNotice`・`galleryCategoryHint`・`listed`（バッジ）・`hidden`（バッジ）・`hiddenNotice`

仕様の「公開する（単語パックの画面）」のとおり。スイッチは `@/components/ui` の既存の `Switch` を使う。要求中は押せない。失敗したら表示を元に戻して理由を出す。カテゴリーの有無は `useWordLists()` の `packs` から `pack.category` で見る。共有がないときにスイッチを入れると `share(packId, true)` でリンクを作って載せる。

- [ ] **Step 1: 失敗する E2E を書く**

```ts
test('the owner puts a pack in the gallery from the share dialog and takes it out')
// 共有ダイアログでスイッチを入れる → リンクができ、行に「共有中」と「ギャラリーに掲載中」→ GET /api/gallery?q=<accountId> に1件
// スイッチを切る → バッジが消え、一覧から消える; リンクは残る
test('a pack without a category is told it would be easier to find')
test('a pack hidden by an administrator says so and cannot be put back by its owner')
// 掲載後に withDatabase で hidden_at = now() → 再読み込みで行に「非公開にされました」、スイッチは disabled、
// 「共有を更新」は成功し、/api/shared?id= は 404
test('a failed change puts the switch back and says why')
// page.route('**/api/shares', …PUT で 503 {"error":"databaseUnavailable"}) → スイッチが元に戻り alert
```

- [ ] **Step 2:** `npx playwright test tests/e2e/gallery.spec.ts tests/e2e/shares.spec.ts`。Expected: 新しいテストが FAIL、既存は PASS。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** 同じコマンドと `npm run typecheck`・`npm test`・`npm run lint`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 5: 管理者ダッシュボードのギャラリー欄

**Files:**
- Create: `src/app/admin/gallery-list.tsx`（`user-list.tsx` と同じ作り）
- Modify: `src/app/admin/admin-dashboard.tsx`（管理者の欄の前に置く）、`src/messages/*/admin.json`（`admin.gallery.*`）、`src/messages/*/errors.json`（`invalidRequest`: 「要求の内容が正しくありません。」）
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 2 の管理者 API
- Produces: 文言のキー `admin.gallery.title`・`empty`・`reports`・`reasons.*`（4つ）・`added`・`listedAt`・`hidden`・`hide`・`unhide`・`failed`

各行に名前（`/shared/<id>` へのリンク。名前がなければ既存の「（名前なし）」）・カテゴリー・追加数・掲載日・通報の件数と理由の内訳・非公開ならその日時、「非公開にする」か「戻す」。押したら一覧を読み直す。失敗は欄の上に alert。

- [ ] **Step 1: 失敗する E2E を書く**（`admin.spec.ts` の既存のテストと同じく `page.route` で `/api/admin/dashboard` と `/api/admin/gallery` を答える）

```ts
test('the administrator sees reported packs first and hides one')
// 通報3件の行が先、内訳「スパム・宣伝 2」「不適切な内容 1」; 「非公開にする」→ POST /api/admin/gallery/hide に {"id"} が届き、一覧を読み直す
test('a hidden pack can be shown again')
test('a failed hide says so')
```

- [ ] **Step 2:** `npx playwright test tests/e2e/admin.spec.ts`。Expected: FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npx playwright test tests/e2e/admin.spec.ts`・`npm run lint`・`npm run typecheck`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 6: 文書とバージョン

**Files:**
- Modify: `src/messages/*/guide.json`（「パックの共有」の節にギャラリーの載せ方・通報・非公開を1段落ずつ）、`docs/features.md`（「ギャラリー」の節に載せ方・通報・非公開化）、`README.md`（共有・ギャラリーの API の説明に Vercel Firewall のレート制限を一文、`/admin` の節にギャラリー欄）、`api-docs/src/app/shares.md`（通報）、`api-docs/src/app/admin.md`（管理者のギャラリー API）、`package.json`・`package-lock.json`
- Test: `tests/e2e/guide.spec.ts`（見出しや段落を数えているなら更新）

- [ ] **Step 1:** 文書を書く。
- [ ] **Step 2:** `git tag` と GitHub Releases を確かめて `npm version 2.8.0 --no-git-tag-version`。
- [ ] **Step 3:** `cd api-docs && npm run docs:build && npm run docs:check`。Expected: PASS。
- [ ] **Step 4:** CLAUDE.md の verify と同じ順で全体を確かめる（PR 1 の Task 8 Step 4 と同じコマンド）。Expected: すべて PASS。
- [ ] **Step 5:** コミットして PR を作る（タイトル例: `パックをギャラリーに載せ、通報と管理者の非公開化をできるようにする (v2.8.0)`）。
