# 単語パック PR 6（リンクで共有）Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインした人がパックの共有リンクを作り、リンクを開いた人（ログインなしでも）がパックの中身を見て自分のパックに追加できるようにする（v0.96.0）。

**Architecture:** 共有はパックのファイル（PR 5 の `typle-pack` v1）のスナップショットを新しいテーブル `typle_shared_packs` に置く。Go の Web サーバー（`/api/workspace` と同じ `server/internal/web`）に持ち主用の `/api/shares` と公開用の `/api/shared` を足し、Vercel の関数（`api/*.go`）とローカルの転送（`next.config.mjs`）にも足す。画面は単語パックの画面の「共有」と、公開ページ `/shared/<id>`。Kotlin のバックエンドにも同じ API を足す。

**Tech Stack:** TypeScript（Next.js 16・React 19・next-intl）、Go（`server/`・Vercel の Go ランタイム）、PostgreSQL、Kotlin（typle-kotlin-backend）、`node --test`、Playwright

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（「4. 配布・取り込み」の「リンクで共有」、「6. API・サーバー」の `0025_shared_packs`、「実装の分け方」の PR 6）。前提は v0.95.0（`src/core/packFile.ts`、`server/internal/workspace/packfile.go`）。

## spec からの変更（この計画で決めたこと）

- **API のパスはクエリで指定する。** spec の `PUT /api/workspace/packs/{p}/share`・`GET /api/shared/{id}` の代わりに、持ち主用は `GET /api/shares`・`PUT /api/shares`（本文 `{ "packId" }`）・`DELETE /api/shares?pack=<packId>`、公開用は `GET /api/shared?id=<id>`。Vercel の Go 関数は1ファイル1パスで、今ある `api/workspace.go` と動的なパスの組み合わせを避けるため。
- **応答に `url` は入れない。** 画面がサイトの origin と `/shared/<id>` から作る（サーバーは公開 URL の設定を持たない）。
- **共有中のパックの削除で共有を消す**のは、`/api/workspace` の保存（`packs` を送ったとき）と、公開 API の変更（`Store.Modify`）の両方で、保存したパックにない `pack_id` の行を同じトランザクションで消す。

## Global Constraints

- テーブル `typle_shared_packs`: `id uuid PRIMARY KEY`、`owner_id text NOT NULL`、`pack_id text NOT NULL`、`data jsonb NOT NULL`、`created_at timestamptz NOT NULL DEFAULT now()`、`updated_at timestamptz NOT NULL DEFAULT now()`、`UNIQUE (owner_id, pack_id)`。マイグレーション `prisma/migrations/0025_shared_packs/migration.sql`（`prisma/schema.prisma` にも model）。
- スナップショット `data` は、保存済みのパックを `EncodePackFile` した JSON（`typle-pack` v1、記録・ID・作成日時・`origin` なし）。1MiB まで。持ち主の名前・ID は公開の応答に入れない。
- 1パックにリンクは1つ。「共有を更新」は同じ `id` のまま `data`・`updated_at` を写し直す。「共有をやめる」は行を消す。
- `/api/shares`:
  - `GET` → `200 { "shares": [{ "id", "packId", "updatedAt" }] }`（持ち主のもの、`updated_at` の新しい順）。
  - `PUT`（本文 `{ "packId" }`）→ `200 { "id", "packId", "updatedAt" }`。保存済みのワークスペースにそのパックがなければ `404 packNotFound`。
  - `DELETE ?pack=<packId>` → `204`（なくても `204`）。
  - 認証・Origin・`Content-Type` の確認は `PUT /api/workspace` と同じ（Cookie ならサイトの Origin が必要、アプリのトークンも可）。ログインなし `401 loginRequired`。
- `/api/shared?id=<id>`: 認証なしの `GET`（`HEAD` も）。`200` で本文はスナップショットそのもの（`Content-Type: application/json; charset=utf-8`、`Cache-Control: no-store`）。`id` が UUID の形でない・行がないときは `404 sharedPackNotFound`。
- 公開ページ `/shared/<id>`: パック名・説明・カテゴリ・タグと、各リストの名前・難易度・単語（表示する単語・入力する文字・補足）を見せる。持ち主と記録は出さない。「自分のパックに追加」は PR 5 の `importPackFile` で取り込む（ゲストはブラウザーに保存）。行がなければ「この共有は終了しました」。
- 共有はログインしているときだけ（ゲストのパックのメニューには出さない）。
- 画面の文言は6言語。用語は ja パック、en pack、zh-CN/zh-TW 包、ru набор、fr pack。フランス語のアポストロフィは ’。新しいエラーキー `sharedPackNotFound` を `errors.json`（6言語）に。
- 出力・コミットメッセージ・README・`docs/api.md` は日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **共有中のパックを削除・アカウントのデータを古いアプリで保存**: 共有の行が残り続けない（`packs` を送った保存では消え、`lists` だけの保存ではパックが残るので消さない）（Task 1）。
2. **ほかの人の共有を消す・更新する**: `owner_id` が違う行には触れない（Task 1・2）。
3. **公開の応答に持ち主の情報が入らない**（Task 2 のテスト）。
4. **共有したあとにパックを編集**: リンク先は「共有を更新」するまで前の中身のまま、更新すると同じリンクで新しい中身（Task 4）。
5. **共有のリンクを開いた人がすでに同じ名前のパックを持っている**: 「名前（2）」で追加される（Task 5）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `prisma/migrations/0025_shared_packs/migration.sql`・`prisma/schema.prisma` | テーブル |
| `server/internal/store/shares.go`（新）・`store.go` | 共有の読み書き、保存時の後片付け |
| `server/internal/web/shares.go`（新）・`web.go` | `/api/shares`・`/api/shared` |
| `server/vercel/vercel.go`・`api/shares.go`・`api/shared.go`（新） | Vercel の関数 |
| `next.config.mjs` | ローカルの転送に `/api/shares`・`/api/shared` |
| typle-kotlin-backend の `store/Store.kt`・`web/*` | 同じ API |
| `src/lib/useShares.ts`（新）・`src/components/WordLists/ShareDialog.tsx`（新）・`PackRow.tsx`・`edit/page.tsx` | 共有の操作と「共有中」 |
| `src/app/shared/[id]/page.tsx`（新） | 公開ページ |
| `src/messages/*/wordLists.json`・`errors.json`（新しい名前空間が要れば `shared.json`） | 文言（6言語） |
| `docs/api.md`・`README.md`・`package.json`・`package-lock.json`・`src/messages/*/guide.json` | v0.96.0 |

---

### Task 1: テーブルと Go の store

**Files:**
- Create: `prisma/migrations/0025_shared_packs/migration.sql`、`server/internal/store/shares.go`、`server/internal/store/shares_test.go`
- Modify: `prisma/schema.prisma`、`server/internal/store/store.go`（`WriteRevision`・`Modify` で消えたパックの共有を消す）

**Interfaces:**
- Produces:
  ```go
  type Share struct { ID, PackID string; UpdatedAt time.Time }
  // 保存済みのワークスペースのパックをスナップショットにして作成・更新する。パックがなければ &workspace.Error{Key: "packNotFound"}。
  func (s *Store) PutShare(ctx context.Context, owner, packID string) (*Share, error)
  func (s *Store) DeleteShare(ctx context.Context, owner, packID string) error
  func (s *Store) ListShares(ctx context.Context, owner string) ([]Share, error)
  // 公開用。なければ (nil, nil)。
  func (s *Store) SharedPack(ctx context.Context, id string) (json.RawMessage, error)
  ```
- `PutShare` は行を `FOR UPDATE` で読んだワークスペースから `workspace.EncodePackFile` でスナップショットを作り、`INSERT … ON CONFLICT (owner_id, pack_id) DO UPDATE SET data = …, updated_at = now()` で、同じ `id` を保つ。スナップショットが 1MiB を超えたら `&workspace.Error{Key: "invalidWorkspace"}`。
- `WriteRevision`（`packs` を書くとき）と `Modify` は、同じトランザクションで `DELETE FROM typle_shared_packs WHERE owner_id = $1 AND NOT (pack_id = ANY($2))`（`$2` は保存したパックの id）。`lists` だけの保存では消さない。

- [ ] **Step 1: マイグレーションを書いてテスト用 DB に当てる**

```sql
-- 0025_shared_packs: 単語パックの共有リンク。data はパックのファイル（typle-pack v1）のスナップショット。
CREATE TABLE "typle_shared_packs" (
  "id" UUID PRIMARY KEY,
  "owner_id" TEXT NOT NULL,
  "pack_id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "typle_shared_packs_owner_pack" UNIQUE ("owner_id", "pack_id")
);
```

Run: `DATABASE_URL=<テスト用DB> npm run db:migrate`

- [ ] **Step 2: 失敗するテストを書く**（`TYPLE_TEST_DATABASE_URL` のときに動く今の store のテストの書き方で）
- `PutShare` が行を作り、2回目は同じ `id` で `data` と `updated_at` が変わる。`SharedPack` が `EncodePackFile` と同じバイト列を返す。ないパックは `packNotFound`。
- `DeleteShare` は自分の行だけを消す（ほかの `owner_id` の同じ `pack_id` は残る）。`ListShares` は自分の行だけ。
- `WriteRevision` で `packs` からパックを外すと、そのパックの共有が消える。`lists` だけの保存では消えない。`Modify`（公開 API の削除）でも消える。

- [ ] **Step 3: 失敗を確かめる**

Run: `cd server && TYPLE_TEST_DATABASE_URL=<テスト用DB> go test ./internal/store/`
Expected: FAIL

- [ ] **Step 4: 実装する**

- [ ] **Step 5: 通ることを確かめる**

Run: `cd server && TYPLE_TEST_DATABASE_URL=<テスト用DB> go test ./... && go vet ./... && gofmt -l .`
Expected: PASS（`TestPutListLimit` は変更前から失敗するもの）

- [ ] **Step 6: コミット**

```bash
git add prisma server
git commit -m "feat(server): 共有リンクのテーブルを足し、パックのスナップショットを保存する"
```

---

### Task 2: Go の `/api/shares`・`/api/shared` と Vercel・ローカルの転送

**Files:**
- Create: `server/internal/web/shares.go`、`server/internal/web/shares_test.go`、`api/shares.go`、`api/shared.go`
- Modify: `server/internal/web/web.go`（ルートと `Store` インターフェース）、`server/vercel/vercel.go`（`/api/shared` は DB だけ、`/api/shares` はログインと DB の部品に）、`server/vercel/vercel_test.go`、`next.config.mjs`（`beforeFiles` に `/api/shares`・`/api/shared`）

**Interfaces:**
- Consumes: Task 1 の `PutShare`・`DeleteShare`・`ListShares`・`SharedPack`、今の `owner`・`sameOrigin`・`fromApp`・`refuse`・`reply`・`readBody`
- Produces: Global Constraints の `/api/shares`・`/api/shared` の振る舞い

- [ ] **Step 1: 失敗するテストを書く**（`server/internal/web/workspace_test.go` の偽の Store の書き方で）
- `/api/shares`: ログインなし 401、Cookie で Origin なしの `PUT` は 403、`Content-Type` 違いは 403、本文が `{ "packId" }` 以外は 400 `invalidWorkspace`（今の `/api/workspace` の本文の誤りと同じキー）、ないパックは 404 `packNotFound`、成功の形、`DELETE` の 204、`GET` の一覧、ほかのメソッドは 405。
- `/api/shared`: `id` なし・UUID の形でない・ない行は 404 `sharedPackNotFound`、成功は本文がスナップショットそのもので `Cache-Control: no-store`、Cookie がなくても読める、`HEAD` は本文なし、`POST` は 405。応答に `owner_id` が含まれない。
- `vercel_test.go`: `/api/shared` はログインの設定がなくても答え、`/api/shares` はログインの設定がなければ今の `/api/workspace` と同じ答え。

- [ ] **Step 2: 失敗を確かめる**

Run: `cd server && go test ./internal/web/ ./vercel/`
Expected: FAIL

- [ ] **Step 3: 実装する**

`api/shares.go`・`api/shared.go` は `api/workspace.go` と同じ形（`vercel.Handler().ServeHTTP`）。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd server && TYPLE_TEST_DATABASE_URL=<テスト用DB> go test ./... && go vet ./... && gofmt -l .`、`npm run build`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add server api next.config.mjs
git commit -m "feat(server): 共有リンクの API（/api/shares・/api/shared）を追加する"
```

---

### Task 3: typle-kotlin-backend の共有 API

**Files（`../typle-kotlin-backend`。ブランチ `feat/shared-packs`）:**
- Modify: `store/Store.kt`（Task 1 と同じ4つの操作と保存時の後片付け）、`web/*`（Task 2 と同じ2つのパス）、テスト、README の「Go との互換」

**Interfaces:**
- Consumes: Go の Task 1・2 の振る舞い（パス・ステータス・エラーキー・JSON の項目の順）。スナップショットは Go の `EncodePackFile` と同じバイト列にする必要がある（`tests/fixtures/pack-file` と README の書き方に従う。Kotlin にパックのファイルの書き出しがなければ、`GoJson` で同じ形を作る）。

- [ ] **Step 1: 失敗するテストを書く**（Task 1・2 のテストと同じ場合。DB のテストは `TYPLE_TEST_DATABASE_URL` で）
- [ ] **Step 2: 失敗を確かめる**（Docker の JDK 21 で `./gradlew test`）
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる**

Run: `docker run --rm -v <typle-kotlin-backend>:/w -v typle-gradle-cache:/root/.gradle -w /w -e TYPLE_TEST_DATABASE_URL=<host.docker.internal の DB> eclipse-temurin:21-jdk ./gradlew test`
Expected: PASS

- [ ] **Step 5: コミット**（typle-kotlin-backend の `feat/shared-packs`）

```bash
git commit -m "feat: 共有リンクの API（/api/shares・/api/shared）を追加する（typle-r v0.96.0）"
```

---

### Task 4: 単語パックの画面の「共有」

**Files:**
- Create: `src/lib/useShares.ts`、`src/components/WordLists/ShareDialog.tsx`
- Modify: `src/components/WordLists/PackRow.tsx`（メニューの「共有」と「共有中」の印）、`src/app/(workspace)/edit/page.tsx`、`src/messages/*/wordLists.json`・`errors.json`（6言語）
- Test: `tests/e2e/shares.spec.ts`（新。ログインしたアカウントで。`tests/e2e/account.spec.ts` のログインのやり方に合わせる）

**Interfaces:**
- Consumes: Task 2 の `/api/shares`
- Produces: `useShares(): { shares: Map<packId, { id, updatedAt }>, share(packId): Promise<…>, stop(packId): Promise<void>, error }`（ゲストでは何もしない）

画面の決めごと:
- ログインしているときだけ、パックのメニューに「共有」。押すとダイアログ: 共有していなければ説明と「リンクを作る」。共有中なら、リンク（`${location.origin}/shared/<id>`）と「コピー」、最後に更新した日時、「共有を更新」「共有をやめる」。
- 共有中のパックの行に「共有中」の印。
- パックを保存したあと（編集・リストの追加など）は自動では更新しない。ダイアログで「共有を更新」したときだけ。
- パックを削除する確認に、共有中なら「共有も終わります」を足す。

- [ ] **Step 1: 失敗する E2E を書く**
- ログインしてパックを共有するとリンクが出て、行に「共有中」が付く。
- リンクを別のコンテキスト（ログインなし）で開くとパックの中身が見える（Task 5 の前なので、ここでは `GET /api/shared?id=` の応答を確かめる）。
- パックの名前を変えても `/api/shared` の中身は前のまま。「共有を更新」すると同じ `id` で新しい名前になる。
- 「共有をやめる」で `/api/shared` が 404 になり、「共有中」が消える。
- 共有中のパックを削除すると `/api/shared` が 404 になる。
- ゲストではメニューに「共有」がない。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/shares.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` は負荷でたまに落ちるもの）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: 単語パックの画面からパックを共有し、共有を更新・停止できるようにする"
```

---

### Task 5: 公開ページ `/shared/<id>`

**Files:**
- Create: `src/app/shared/[id]/page.tsx`
- Modify: `src/messages/*/wordLists.json`（または新しい名前空間、6言語）
- Test: `tests/e2e/shares.spec.ts`

**Interfaces:**
- Consumes: Task 2 の `GET /api/shared?id=`、PR 5 の `decodePackFile`・`importPackFile`、`useWordLists()` の `updateLibrary`・`packs`・`lists`、`randomId`

画面の決めごと:
- ログインしていなくても開ける（ワークスペースのレイアウトの外。ナビとフッターは今のトップページ・`/about` と同じ扱い）。
- 読み込み中・見つからない（「この共有は終了しました」と単語パックの画面へのリンク）・読めない（`packFileUnreadable`）の3つの状態。
- パック名・説明・カテゴリ・タグ、リストごとに名前と難易度と単語の表（表示する単語・入力する文字・補足）。
- 「自分のパックに追加」: `importPackFile` を一度ためしてから保存（PR 5 の取り込みと同じ）。追加したら `/edit?pack=<新しい id>` へ。リストが上限なら押せず理由を出す。

- [ ] **Step 1: 失敗する E2E を書く**
- ログインしたアカウントで共有したリンクを、ゲストのコンテキストで開くとパック名と単語が見える。持ち主の名前は出ない。
- 「自分のパックに追加」で、ゲストのブラウザー保存にパックが入り、`/edit?pack=` で表示される。同じ名前のパックがあると「名前（2）」。
- 共有をやめたリンクを開くと「この共有は終了しました」。
- でたらめな `id` でも同じ表示。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/shares.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: 共有リンクの公開ページを追加し、自分のパックに追加できるようにする"
```

---

### Task 6: docs・README・ガイドと v0.96.0

**Files:**
- Modify: `docs/api.md`（`/api/shares`・`/api/shared` と、`/api/workspace` の保存で共有が消えること）、`README.md`（「## v0.95.0」の前に v0.96.0）、`package.json`・`package-lock.json`、`src/messages/*/guide.json`（共有の説明、6言語）

- [ ] **Step 1: 書く**

README「## v0.96.0 — 単語パックをリンクで共有できるようにしました」: 共有の作成・更新・停止、公開ページ、ゲストでも追加できること、パックの削除で共有が終わること、マイグレーション `0025_shared_packs`、typle-kotlin-backend の `feat/shared-packs`、spec からの変更（API のパス、`url` を返さない）。`npm version 0.96.0 --no-git-tag-version`。

- [ ] **Step 2: 全体を確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && (cd server && TYPLE_TEST_DATABASE_URL=<テスト用DB> go test ./... && go vet ./...) && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`TestPutListLimit` は変更前から失敗するもの）

- [ ] **Step 3: コミット**

```bash
git add docs/api.md README.md package.json package-lock.json src/messages
git commit -m "docs: v0.96.0 の共有リンクを README・API の文書・ガイドに書く"
```

リリースは `docs/release-workflow.md` の順（PR → squash merge → verify → Release → デプロイ）。デプロイのビルドで本番の DB に `0025_shared_packs` が適用される（テーブルを足すだけで、古いアプリと互換）。
