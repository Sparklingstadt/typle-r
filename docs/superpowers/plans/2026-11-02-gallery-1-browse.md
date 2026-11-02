# ギャラリー 1: 一覧と検索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 共有リンクに「ギャラリーに載せる」を API として足し、だれでも `/gallery` で掲載中のパックを検索・絞り込み・並べ替えして `/shared/<id>` の下見と追加に進めるようにする。

**Architecture:** `typle_shared_packs` に `listed_at`・`hidden_at`・`add_count` を足し、通報の表 `typle_gallery_reports` もこの PR のマイグレーションで作る（使うのは PR 2）。ギャラリーは「`listed_at` があり `hidden_at` がない共有」を `data`（パックのファイルの JSON）から読む一覧で、写しは増やさない。GET のギャラリー API は `/api/shared` と同じく DB だけで答える公開ハンドラーに入れる。

**Tech Stack:** Go（`server/internal/store`・`web`・`vercel`、pgx）、PostgreSQL、Next.js 16 / React 19 / next-intl、node:test、Playwright

**Spec:** `docs/superpowers/specs/2026-11-02-gallery-design.md`

## Global Constraints

- バージョンは v2.7.0（`package.json`・`package-lock.json`）。`npm version` の前に `git tag` と GitHub Releases を見て、使われていればさらに上げる。
- PR とコミットのタイトルは日本語の1文に ` (v2.7.0)`。接頭辞なし。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- Next.js 固有のコードを書く前に `node_modules/next/dist/docs/` の該当部分を読む（AGENTS.md）。
- `src/core`・`src/plugins` から画面への import はしない（`eslint.config.mjs`）。
- 文言は6ロケール（ja, en, zh-CN, zh-TW, ru, fr）すべてに同じキー・同じプレースホルダー（`tests/i18n.test.cjs`）。用語: ja ギャラリー、en gallery、zh-CN 图库、zh-TW 圖庫、ru галерея、fr galerie。フランス語のアポストロフィは ’。
- ギャラリーの API はすべての応答（エラーも）に `X-Robots-Tag: noindex` と `Cache-Control: no-store`。
- 1ページ20件。検索語は前後の空白を除いて200文字（rune）で切る。
- バックエンドのパスは `vercel.json`・`next.config.mjs` の `beforeFiles`・`server/internal/web` の3か所に書く（`tests/backendPaths.test.cjs`）。
- DB のテストは `TYPLE_TEST_DATABASE_URL`（マイグレーション済みのテスト用 DB）。E2E は共有 DB なので、ほかのテストの行に依存しない名前（`newAccountId()` を含む名前）で検索する。
- 「載せる」スイッチとパックの行のバッジは PR 2 で作る（仕様の「進め方」のとおり）。

## Review Focus

- `listed` のない `PUT /api/shares`（iPad・Mac アプリと今の画面）で、掲載中の共有を更新しても掲載が外れない → Task 2 の `TestPutShareKeepsListing`。
- 検索語に `%`・`_`・`\` を含むと全件に当たる → `ILIKE` のワイルドカードをエスケープする。Task 3 の `TestGalleryEscapesWildcards`。
- タグや説明のないパック（`data` にキーがない）が検索・一覧で落ちたり `null` を返したりする → Task 3 の `TestGalleryPackWithoutLabels`。
- `/shared/<id>` の追加が成功した直後に `added` が失敗しても、追加は成功のまま何も出ない → Task 7 の E2E で `route.abort()`。
- ギャラリーに載っていない共有の id で `added` を呼んでも数が変わらず、204 で区別がつかない → Task 3 の `TestCountAddedOnlyListed` と Task 5。

---

### Task 1: マイグレーション `0033_gallery`

**Files:**
- Create: `prisma/migrations/0033_gallery/migration.sql`
- Modify: `prisma/schema.prisma`（`SharedPack` に3列、`GalleryReport` モデル）

**Interfaces:**
- Produces: 列 `typle_shared_packs.listed_at`・`hidden_at`（`TIMESTAMPTZ(6)` NULL 可）・`add_count`（`INTEGER NOT NULL DEFAULT 0`）、表 `typle_gallery_reports`（仕様の SQL のとおり。`share_id` は `ON DELETE CASCADE`）

- [ ] **Step 1:** 仕様の「マイグレーション `0033_gallery`」の SQL を、ほかのマイグレーションと同じく先頭に1行の説明コメントを付けて書く。
- [ ] **Step 2:** `prisma/schema.prisma` の `SharedPack` に `listedAt DateTime? @map("listed_at") @db.Timestamptz(6)`・`hiddenAt`・`addCount Int @default(0) @map("add_count")` と、`GalleryReport`（`@@map("typle_gallery_reports")`、`sharedPack` へのリレーション `onDelete: Cascade`、`@@index([shareId], map: "typle_gallery_reports_share")`）を足す。
- [ ] **Step 3:** テスト用 DB に `npm run db:migrate` を2回実行する。Expected: 1回目で `0033_gallery` が適用され、2回目は何も適用しない。
- [ ] **Step 4:** `npx prisma validate`。Expected: エラーなし。
- [ ] **Step 5:** コミット。

### Task 2: 持ち主の掲載（store）

**Files:**
- Modify: `server/internal/store/shares.go`
- Test: `server/internal/store/shares_test.go`

**Interfaces:**
- Consumes: Task 1 の列
- Produces:
  - `type Share struct { ID, PackID, Name string; Listed, Hidden bool; UpdatedAt time.Time }`
  - `func (s *Store) PutShare(ctx context.Context, owner, packID string, listed *bool) (*Share, error)` — `listed == nil` は掲載を変えない。`true` は `listed_at = COALESCE(listed_at, now())`、`false` は NULL。`hidden_at` がある共有で `listed != nil` なら写しも更新せず `&workspace.Error{Key: "sharedPackHidden"}`
  - `ListShares` が `Listed`（`listed_at IS NOT NULL`）・`Hidden`（`hidden_at IS NOT NULL`）を埋める
  - `SharedPack` は `hidden_at IS NOT NULL` の行を `(nil, nil)` にする

- [ ] **Step 1: 失敗するテストを書く**

```go
func TestPutShareListing(t *testing.T)        // nil→Listed false; &true→Listed true; &true again keeps listed_at; &false→Listed false
func TestPutShareKeepsListing(t *testing.T)   // &true, then nil (rename + share again) → still Listed, listed_at unchanged
func TestPutShareHidden(t *testing.T)         // set hidden_at by SQL; &true and &false → isKey(err, "sharedPackHidden"), data unchanged;
                                              // nil → updates the snapshot, Hidden true in ListShares
func TestSharedPackHidden(t *testing.T)       // hidden_at set → SharedPack returns (nil, nil)
```

`listed_at` は `conn.QueryRow("SELECT listed_at FROM typle_shared_packs WHERE id = $1")` で読んで比べる。既存のテストの `PutShare(ctx, id, pack)` 呼び出しは `PutShare(ctx, id, pack, nil)` にする。

- [ ] **Step 2:** `go test ./server/internal/store -run 'Share'`。Expected: コンパイルエラー（引数の数）。
- [ ] **Step 3:** 実装する。非公開の確認は同じトランザクションで `SELECT hidden_at IS NOT NULL FROM typle_shared_packs WHERE owner_id = $1 AND pack_id = $2 FOR UPDATE` を写しの INSERT の前に読む。INSERT … ON CONFLICT の `SET` に `listed_at = CASE WHEN $5::boolean IS NULL THEN typle_shared_packs.listed_at WHEN $5 THEN COALESCE(typle_shared_packs.listed_at, now()) END` を足し、新しい行では `CASE WHEN $5 THEN now() END` を入れる。
- [ ] **Step 4:** `go test ./server/internal/store`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 3: ギャラリーの読み出しと追加数（store）

**Files:**
- Create: `server/internal/store/gallery.go`
- Test: `server/internal/store/gallery_test.go`

**Interfaces:**
- Consumes: Task 1・2
- Produces:

```go
const GalleryPageSize = 20
const MaxGalleryQuery = 200 // runes

type GallerySort string
const (
	GalleryNew     GallerySort = "new"
	GalleryPopular GallerySort = "popular"
)

type GalleryQuery struct {
	Text, Category string
	Sort           GallerySort
	Page           int // from 1
}

type GalleryPack struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Category    string    `json:"category,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	Lists       int       `json:"lists"`
	Words       int       `json:"words"`
	Added       int       `json:"added"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type GalleryPage struct { Packs []GalleryPack; More bool }
type GalleryCategory struct { Name string `json:"name"`; Count int `json:"count"` }

func (s *Store) Gallery(ctx context.Context, q GalleryQuery) (*GalleryPage, error)
func (s *Store) GalleryCategories(ctx context.Context) ([]GalleryCategory, error)
func (s *Store) CountAdded(ctx context.Context, id string) error
```

- `Gallery` は呼び出し側が検証した `q` を受ける（`Text` は切り詰め済み）。`GalleryPageSize + 1` 件読んで `More` を決める。`Packs` は空でも `[]`。
- `Text` は `name`・`description`・各タグに `ILIKE '%' || $1 || '%' ESCAPE '\'`。`\`・`%`・`_` を `\` でエスケープしてから渡す。
- `Category` は `data #>> '{pack,category}' = $2` の完全一致。
- 並び: `new` は `listed_at DESC, id`、`popular` は `add_count DESC, listed_at DESC, id`。
- `Lists` は `jsonb_array_length(data->'lists')`、`Words` は各リストの `words` の長さの合計。
- `GalleryCategories` はカテゴリーのある掲載中の共有を数え、件数の多い順。同じ件数の並びは Go で `golang.org/x/text/collate`（日本語）で並べる（`store` に既にある名前の並べ方と同じ）。
- `CountAdded` は `UPDATE … SET add_count = add_count + 1 WHERE id = $1 AND listed_at IS NOT NULL AND hidden_at IS NULL`。UUID でない id と当たらない id はエラーなし。

- [ ] **Step 1: 失敗するテストを書く**（各テストは `owner(t, conn)` の新しいアカウントで共有を作り、`newAccountId` 相当の一意な文字列をパック名に入れて、ほかのテストの行と混ざらない検索語で確かめる）

```go
func TestGallerySearch(t *testing.T)           // 名前・説明・タグの日本語の部分一致; 名前 "ABC…" が Text "abc" に当たる
func TestGalleryEscapesWildcards(t *testing.T) // Text "%" と "_" は、名前にその文字を含むパックだけに当たる
func TestGalleryCategoryAndSort(t *testing.T)  // Category の完全一致、new と popular の順（add_count を SQL で 3 と 1 にする）
func TestGalleryPaging(t *testing.T)           // 21 件 → Page 1 は 20 件と More true、Page 2 は 1 件と More false
func TestGalleryExcludes(t *testing.T)         // listed_at NULL と hidden_at ありは出ない
func TestGalleryPackWithoutLabels(t *testing.T) // description・category・tags のないパック → 空文字と nil、Lists と Words は正しい
func TestGalleryCategories(t *testing.T)       // 件数の多い順、掲載していない・非公開・カテゴリーなしは数えない
func TestCountAddedOnlyListed(t *testing.T)    // 掲載中 +1、未掲載・非公開・存在しない UUID・"not-a-uuid" は変わらずエラーなし
```

- [ ] **Step 2:** `go test ./server/internal/store -run 'Gallery|CountAdded'`。Expected: コンパイルエラー。
- [ ] **Step 3:** `gallery.go` を実装する。
- [ ] **Step 4:** `go test ./server/internal/store`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 4: `/api/shares` の掲載（web）

**Files:**
- Modify: `server/internal/web/shares.go`、`server/internal/web/web.go`（`Store` の `PutShare` の型）
- Test: `server/internal/web/shares_test.go`

**Interfaces:**
- Consumes: Task 2 の `PutShare(ctx, owner, packID string, listed *bool)`・`Share.Listed`・`Share.Hidden`
- Produces: `shareJSON` に `Listed bool \`json:"listed"\``・`Hidden bool \`json:"hidden"\``。`readShareBody(r) (packID string, listed *bool, ok bool)`（`readPackID` を置き換える。メンバーは `packId` と任意の `listed`（真偽値）だけ）

- [ ] **Step 1: 失敗するテストを書く**

```go
func TestSharesPutListed(t *testing.T)   // {"packId":"p","listed":true} → fake に &true が届く; {"packId":"p"} → nil
func TestSharesPutInvalid(t *testing.T)  // 既存に追加: "listed":"yes"、"listed":null、未知のメンバー → 400 invalidWorkspace
func TestSharesPutHidden(t *testing.T)   // putErr = &workspace.Error{Key: "sharedPackHidden"} → 409 {"error":"sharedPackHidden"}
func TestSharesList(t *testing.T)        // 既存を更新: 応答の各行に "listed" と "hidden"
```

- [ ] **Step 2:** `go test ./server/internal/web -run Shares`。Expected: FAIL。
- [ ] **Step 3:** 実装する。`sharedPackHidden` は `409`。
- [ ] **Step 4:** `go test ./server/internal/web`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 5: ギャラリーの API と振り分け（web・vercel）

**Files:**
- Create: `server/internal/web/gallery.go`
- Modify: `server/internal/web/web.go`（`Store` に Task 3 の3メソッド、`mux` に3つのパス）、`server/internal/web/shares.go`（`Shared` を `Public` に改名）、`server/vercel/vercel.go`、`vercel.json`、`next.config.mjs`
- Test: `server/internal/web/gallery_test.go`、`server/vercel/vercel_test.go`

**Interfaces:**
- Consumes: Task 3
- Produces:
  - `GET /api/gallery`・`GET /api/gallery/categories`・`POST /api/gallery/added`（仕様の「ギャラリー」の節）
  - 応答: `{"packs":[GalleryPack...],"more":bool}`、`{"categories":[GalleryCategory...]}`。`updatedAt` は `shareOf` と同じ書式（`2006-01-02T15:04:05.000Z07:00`、UTC）
  - `func Public(s Store, report func(*http.Request, error, string)) http.Handler` — `/api/shared`・`/api/gallery`・`/api/gallery/categories` を DB だけで答える（今の `Shared` の置き換え）。`added` は同じ Origin の確認に `AUTH_URL` が要るので通常のハンドラー
  - `vercel.go` の `ServeHTTP` は `/api/shared`・`/api/gallery`・`/api/gallery/categories` を `publicHandler`（今の `sharedHandler` の改名）へ。DB がないときの答えに `noindex` と `Cache-Control: no-store`
  - `vercel.json` と `next.config.mjs` に `/api/gallery` と `/api/gallery/:path*`

- [ ] **Step 1: 失敗するテストを書く**

```go
func TestGalleryQuery(t *testing.T)      // ?q=%20abc%20&category=語学&sort=popular&page=2 → fake に {Text:"abc", Category:"語学", Sort:popular, Page:2}
                                         // 201 rune の q は 200 rune に切られる; 既定は Sort new・Page 1
func TestGalleryInvalid(t *testing.T)    // sort=old、page=0、page=abc、page=10001 → 400 invalidQuery
func TestGalleryAnswer(t *testing.T)     // 本文の形、Packs が空なら "packs":[]、ヘッダー X-Robots-Tag: noindex と Cache-Control: no-store
func TestGalleryDown(t *testing.T)       // store のエラー → 503 databaseUnavailable、noindex 付き
func TestGalleryCategories(t *testing.T) // 本文の形とヘッダー
func TestGalleryAdded(t *testing.T)      // 同じ Origin で ?id= → 204 と fake への id; 別の Origin → 403 forbiddenRequest; GET → 405
func TestGalleryMethod(t *testing.T)     // POST /api/gallery → 405
```

`vercel_test.go` には、ログインの設定がなくても `/api/gallery` が DB だけで答え、DB がなければ 503 に `noindex` が付くテストを、今の `/api/shared` のテスト（436行目付近）にならって足す。`page` の上限は `admin.go` の `maxUsersPage` にならって `maxGalleryPage = 10000`。

- [ ] **Step 2:** `go test ./server/...`。Expected: FAIL。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `go test ./server/...`・`node --test tests/backendPaths.test.cjs`・`gofmt -l .`（空）・`go vet ./...`。Expected: すべて PASS。
- [ ] **Step 5:** コミット。

### Task 6: ギャラリーの応答と検索条件（TS core）

**Files:**
- Create: `src/core/gallery.ts`
- Test: `tests/gallery.test.cjs`

**Interfaces:**
- Produces:

```ts
export const GALLERY_SORTS = ['new', 'popular'] as const
export type GallerySort = typeof GALLERY_SORTS[number]
export type GalleryQuery = { text: string; category: string; sort: GallerySort }
export type GalleryPack = { id: string; name: string; description?: string; category?: string; tags?: string[]; lists: number; words: number; added: number; updatedAt: string }
export type GalleryPage = { packs: GalleryPack[]; more: boolean }
export type GalleryCategory = { name: string; count: number }

export function galleryQueryOf(params: URLSearchParams): GalleryQuery          // q→text, category, sort（不正・なしは 'new'）
export function gallerySearchParams(query: GalleryQuery): URLSearchParams        // 空の値と sort 'new' は書かない
export function galleryApiPath(query: GalleryQuery, page: number): string         // '/api/gallery?q=…&category=…&sort=…&page=…'
export function decodeGalleryPage(data: unknown): GalleryPage                    // 形が違えば AppError('invalidServerData')
export function decodeGalleryCategories(data: unknown): GalleryCategory[]
```

- [ ] **Step 1:** テストを書く: `galleryQueryOf(new URLSearchParams('q=abc&sort=old'))` が `{ text: 'abc', category: '', sort: 'new' }`、`gallerySearchParams({ text: '', category: '語学', sort: 'new' }).toString()` が `'category=%E8%AA%9E%E5%AD%A6'`、往復で同じ条件、`decodeGalleryPage({ packs: [{ id: 'x' }], more: false })` が `invalidServerData` を投げる、`tags` に文字列以外があれば投げる、正しい応答はそのまま返す。
- [ ] **Step 2:** `node --test tests/gallery.test.cjs`。Expected: FAIL（モジュールがない）。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `node --test tests/gallery.test.cjs`・`npm run typecheck`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 7: `/gallery` の画面と入り口、追加数

**Files:**
- Create: `src/app/gallery/page.tsx`、`src/app/gallery/layout.tsx`（`src/app/shared/[id]/layout.tsx` と同じく noindex のメタデータ）、`src/components/Gallery/GalleryList.tsx`
- Modify: `src/app/shared/[id]/page.tsx`（追加の成功後に `POST /api/gallery/added?id=`）、`src/app/(workspace)/packs/catalog/page.tsx`（下にギャラリーへのリンク）、`src/components/Sidebar/navigation.ts`（`wordLists` グループの `create` の後に `{ name: "gallery", path: "/gallery", icon: LayoutGrid }`）、`src/messages/*/nav.json`・`wordLists.json`・`metadata.json`・`errors.json`（`invalidQuery`）
- Test: `tests/e2e/gallery.spec.ts`

**Interfaces:**
- Consumes: Task 5 の API、Task 6 の関数
- Produces: 文言のキー `wordLists.gallery.*`（`title`・`intro`・`search`・`category`・`allCategories`・`sort`・`sortNew`・`sortPopular`・`lists`・`words`・`added`・`more`・`empty`・`noResults`・`loadFailed`・`retry`）、`wordLists.catalog.toGallery`、`nav.links.gallery`、`metadata.galleryTitle`、`errors.invalidQuery`

画面の振る舞いは仕様の「探す（`/gallery`）」のとおり。条件を変えたら `router.replace` で URL を変え、1ページ目から読み直す。検索欄は送信（Enter かボタン）で反映し、打つたびには読まない。「もっと見る」は次のページを今の一覧の後ろに足す。`page.tsx` は `useSearchParams` を使うので、Next.js の文書の該当部分（`Suspense` の要否）を読んでから書く。

`added` は `fetch(…, { method: 'POST', keepalive: true }).catch(() => {})` で、`router.push` の前に送って待たない。

- [ ] **Step 1: 失敗する E2E を書く**

```ts
test('a pack put in the gallery is found by a guest, previewed and added, and its count goes up')
// 持ち主: signIn → PUT /api/workspace（名前に accountId を含むパック、category 'E2E'、タグ 'gallery-e2e'）
//        → PUT /api/shares {packId, listed: true}
// ゲストの別コンテキスト: /gallery?q=<accountId> → カードが1枚、リスト数・単語数・「追加 0」
//        → カードを押す → /shared/<id> → 「自分のパックに追加」→ /edit?pack=…
// GET /api/gallery?q=<accountId> の added が 1
test('the search, category and order are kept in the URL')
// /gallery で検索・カテゴリー・追加の多い順を選ぶ → URL に q・category・sort、再読み込みで同じ選択
test('a failed count does not spoil the add')
// page.route('**/api/gallery/added**', route => route.abort()) → 追加は成功して /edit に移り、エラーは出ない
test('a pack that is not in the gallery is not listed and its add is not counted')
// listed なしで共有 → /gallery?q=<accountId> に「見つかりませんでした」; /shared/<id> から追加しても add_count は 0（withDatabase で読む）
```

afterEach で `typle_shared_packs`・`typle_workspaces`・`typle_records` のその持ち主の行を消す（`shares.spec.ts` と同じ）。

- [ ] **Step 2:** `npx playwright test tests/e2e/gallery.spec.ts`。Expected: FAIL（`/gallery` が 404）。
- [ ] **Step 3:** 画面・入り口・文言を実装する。
- [ ] **Step 4:** `npx playwright test tests/e2e/gallery.spec.ts tests/e2e/shares.spec.ts`・`npm test`・`npm run lint`・`npm run typecheck`。Expected: PASS。
- [ ] **Step 5:** コミット。

### Task 8: 文書とバージョン

**Files:**
- Modify: `api-docs/src/app/shares.md`（`listed`・`hidden`・`409 sharedPackHidden`、ギャラリーの3つの API）、`api-docs/src/app/README.md`（パスの一覧があれば）、`README.md`（`server/internal/web` の表と `server/vercel` の説明にギャラリーのパス）、`docs/features.md`（「ギャラリー」の節: 探し方。載せ方は PR 2 で書く）、`api/index.go`（冒頭のコメントのパスの一覧）、`package.json`・`package-lock.json`

- [ ] **Step 1:** 文書を書く。`docs/features.md` には画面から使える機能（ギャラリーの見方・探し方）だけを書き、載せ方は PR 2 で足す。
- [ ] **Step 2:** `git tag` と GitHub Releases を確かめて `npm version 2.7.0 --no-git-tag-version`。
- [ ] **Step 3:** `cd api-docs && npm run docs:build && npm run docs:check`。Expected: PASS。
- [ ] **Step 4:** CLAUDE.md の verify と同じ順で全体を確かめる: `node --test scripts/ci/release.test.cjs`、`npm run db:migrate`（テスト用 DB）、`gofmt -l .`、`go vet ./...`、`go test ./...`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run test:e2e`。Expected: すべて PASS。
- [ ] **Step 5:** コミットして PR を作る（タイトル例: `単語パックのギャラリーを公開し、検索と追加数を数える (v2.7.0)`）。
