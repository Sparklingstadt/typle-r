# 単語パック 7: 共有の後始末 Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v0.96.0 の共有リンクで残った 4 点を直す: パックがなくなったリンクを消す・止められるようにする、共有の失敗理由を出す、コピーを読み上げる、公開 API に `X-Robots-Tag: noindex` を付ける。

**Architecture:** サーバーは保存のたびに「保存後に読み戻したワークスペースのパック」にないリンクを消す（`lists` だけの保存でも）。`/api/shares` は各リンクにスナップショットのパック名 `name` を付けて返し、画面は今のパックにないリンクを単語パック画面の下に一覧して止められるようにする。Kotlin の開発用バックエンドも同じにする。

**Tech Stack:** Go (server/internal/store, web), PostgreSQL, Next.js 16 / React 19 / next-intl, Playwright, Kotlin (../typle-kotlin-backend)

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（共有リンクの節）と、このプランの冒頭の 4 点（ユーザー承認済み）。

## Global Constraints

- 出力・文言は日本語が基準。6 ロケール（ja, en, zh-CN, zh-TW, ru, fr）すべてに同じキー・同じプレースホルダーを入れる（`tests/i18n.test.cjs`）。用語: ja パック, en pack, zh 包, ru набор, fr pack。フランス語のアポストロフィは ’。
- バージョンは v0.96.1（package.json / package-lock.json / README のバージョン節、これまでの PR と同じ場所）。
- Next.js 固有のコードを書く前に `node_modules/next/dist/docs/` の該当部分を読む（AGENTS.md）。
- DB を使うテストは `DATABASE_URL=postgresql://typle:typle@127.0.0.1:62845/typle?sslmode=disable`（0025 まで適用済み）。他のデータベースやコンテナには触らない。
- Kotlin は Docker の `eclipse-temurin:21-jdk` で `./gradlew test`（これまでと同じ手順）。
- リクエスト数の制限はコードでは作らない（Vercel Firewall で設定する。README に手順を一文で書く）。
- コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

- 古いアプリが `lists` だけを保存し、保存済みの `packs` が NULL（パックが導出される）アカウントで、最初のリストを消す → 導出パック id が変わり、そのリンクは保存と同じトランザクションで消える。
- 端末だけ（devices だけ）の保存ではリンクが消えない。
- 画面でパックを消した直後、そのパックのリンクが「パックが見つからない共有」に一瞬でも出ない（保存後に `/api/shares` を読み直すまで古い一覧を孤立扱いしない）。
- 孤立リンクを止めたあと一覧から消え、止めるのに失敗したら理由が出る。
- `/api/shared` は 200 でも 404 でも `X-Robots-Tag: noindex` が付く。

---

### Task 1: Go — 保存後のパックでリンクを消す、名前付きの一覧、noindex

**Files:**
- Modify: `server/internal/store/store.go`（`WriteRevision`）
- Modify: `server/internal/store/shares.go`（`Share`, `ListShares`）
- Modify: `server/internal/web/shares.go`（`shareJSON`, `shared`）
- Test: `server/internal/store/shares_test.go`, `server/internal/web/shares_test.go`

**Interfaces:**
- Produces: `store.Share{ID, PackID, Name string; UpdatedAt time.Time}`。`Name` は `ListShares` だけが埋める（スナップショットの `data #>> '{library,packs,0,name}'`、なければ ""）。`PutShare` は空のまま。
- Produces: `/api/shares` GET の各要素と PUT の応答に `"name"`（PUT は `PutShare` に渡した pack の名前ではなく、ListShares と同じくスナップショットから読むか、PutShare でも RETURNING で読む。どちらでも同じ値になること）。JSON: `{"id","packId","name","updatedAt"}`。
- Produces: `/api/shared` の全応答（200, 404, 503, 405）に `X-Robots-Tag: noindex`。

- [ ] **Step 1: 失敗するテストを書く**
  - store: `TestWriteRevisionListsOnlyDeletesSharesOfDerivedPacks` — packs を NULL のまま lists だけで保存したアカウントで、導出パック `pack-<firstListId>` を `PutShare` → 先頭のリストを除いた lists だけを `WriteRevision`（`HasLists` のみ）→ `ListShares` が空。
  - store: `TestWriteRevisionDevicesOnlyKeepsShares` — devices だけの保存のあとも `ListShares` が 1 件。
  - store: `TestListSharesNames` — `PutShare` したパックの名前が `ListShares()[0].Name`。
  - web: GET /api/shares の要素に `name`、PUT の応答に `name`。
  - web: `/api/shared` の 200 と 404 に `X-Robots-Tag: noindex`。
  - web: `TestDeleteShareWrongOrigin` — Cookie 付きで `Origin: https://evil.example` の DELETE が 403 `forbiddenRequest`、store の `DeleteShare` は呼ばれない。
- [ ] **Step 2: 失敗を確認** `cd server && DATABASE_URL=... go test ./internal/store/ ./internal/web/ -run 'Share|Shared|WriteRevision'`
- [ ] **Step 3: 実装**
  - `WriteRevision`: `HasPacks` なら今まで通り `change.Packs`。そうでなく `HasLists` なら、`writeRevision` が返した `saved` を `workspace.Decode(saved.Lists, saved.Devices, saved.Packs)` で読み、その `Packs` で `deleteRemovedShares`（同じトランザクション内）。devices だけなら何もしない。`saved` が保存後の行でない分岐（競合で保存されなかった場合）があればその場合は消さない — `writeRevision` の戻り値を読んで判断する。
  - `ListShares` / `PutShare` の SELECT・RETURNING に名前を足す。
  - `shared()` の最初（methods より前）で `w.Header().Set("X-Robots-Tag", "noindex")`。`refuse` が Header を消さないことを確認する。
- [ ] **Step 4: 通ることを確認** 同じコマンドと `go test ./...`（`TestPutListLimit` は main でも落ちる既知の失敗）。
- [ ] **Step 5: コミット** `fix(shares): delete links of packs gone from any save, list names, noindex`

### Task 2: Kotlin — Task 1 と同じ振る舞い

**Files:** `../typle-kotlin-backend` の `store/Store.kt`, `web/ShareRoutes.kt`, `PgSharesTest.kt`, `ShareRoutesTest.kt`, README「Go との互換」

**Interfaces:**
- Consumes: Task 1 の JSON（`name` 付き）、`X-Robots-Tag: noindex`、lists だけの保存でのリンク削除、wrong-Origin DELETE 403。

- [ ] **Step 1: Task 1 と同じ 6 つのテストを Kotlin 側に書く**（名前は既存のテストの書き方に合わせる）
- [ ] **Step 2: 失敗を確認** Docker JDK で `./gradlew test`
- [ ] **Step 3: 実装**（`hasLists && !hasPacks` のとき保存後の行を decode してそのパックで `deleteRemovedShares`）
- [ ] **Step 4: 通ることを確認**
- [ ] **Step 5: kotlin リポジトリの main ではなくブランチ `feat/share-followups` でコミット**

### Task 3: 画面 — 失敗理由、読み上げ、孤立リンク、Sentry

**Files:**
- Modify: `src/lib/useShares.ts`
- Modify: `src/components/WordLists/ShareDialog.tsx`
- Create: `src/components/WordLists/OrphanShares.tsx`
- Modify: `src/app/(workspace)/edit/page.tsx`
- Modify: `src/lib/sentry.ts`
- Modify: `src/messages/*/errors.json`, `src/messages/*/wordLists.json`（6 ロケール）
- Test: 既存の単体テストの場所に `sanitizeSentryEvent` のテスト、`tests/e2e/shares.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `/api/shares` JSON（`name`）。
- Produces: `export type Share = { id: string; name: string; updatedAt: string }`、`useShares(): { enabled, shares: Map<packId, Share>, share, stop }`（形は今と同じ）。

- [ ] **Step 1: 失敗するテストを書く**
  - unit: `sanitizeSentryEvent` が `request.url` の `/shared/<id>` を `/shared/[id]` にし、`event.transaction` の同じ部分も置き換える。
  - e2e（`shares.spec.ts`）: ログインしたアカウントの `typle_shared_packs` に、存在しない pack_id（`pack-gone`、data は既存テストで作ったスナップショットを流用）の行を直接入れる → /edit に「パックが見つからない共有」とそのパック名が出る → 「共有をやめる」→ 一覧が消え、DB の行もない。
  - e2e: パックを共有してからそのパックを削除しても、孤立リンクの一覧は出ない。
  - e2e: 共有を作る PUT を `page.route` で `404 {"error":"packNotFound"}` にすると、ダイアログに `errors.packNotFound` の文言が出る。
- [ ] **Step 2: 失敗を確認** `npx playwright test tests/e2e/shares.spec.ts`（DATABASE_URL 付き）と単体テスト
- [ ] **Step 3: 実装**
  - `useShares.request`: 401 以外の失敗は本文の `{error}` が文字列ならその key で `AppError`（未知の key は `useErrorText` が呼び出し側の fallback にする）、読めなければ `workspaceRequestFailed`。
  - `useShares`: 一覧の取得を、今のパック id の集合（`useWordLists().packs` の id を並べた文字列）が変わるたびにやり直す。取得し直すまでは、前回の一覧にあっても今のパックにないものを孤立扱いしないよう、`loaded` に「取得したときのパック id 集合」を持たせ、それが今と違う間は `orphans` を空にする。`orphans: Share & { packId }[]`（今のパックにないもの）を返り値に足す。
  - `ShareDialog`: コピー成功を `<span className="sr-only" aria-live="polite">` で知らせる（ボタンの見た目は今のまま）。タイマーは ref に持ち、閉じたとき・アンマウントで clear する。
  - `OrphanShares`: `orphans` が 1 件以上のときだけ、パック一覧の下に見出し（`wordLists.share.orphans.title`）、説明（`…orphans.description`）、各行にパック名（空なら `…orphans.unnamed`）と更新日時と「共有をやめる」ボタン（`…orphans.stop`、aria-label に名前を含める `…orphans.stopLabel` `{name}`）。失敗はその下に `role="alert"` で `errorText(reason, t('failed'))`。
  - `sentry.ts`: `url` と `transaction` の `/shared/[^/?#]+` を `/shared/[id]` に。
  - 文言: `errors.packNotFound`（ja「このパックが見つかりません。ページを再読み込みしてください。」）と `wordLists.share.orphans.*` を 6 ロケールに。
- [ ] **Step 4: 通ることを確認** `npm test`、`npm run lint`、`npx tsc --noEmit`、`npx playwright test tests/e2e/shares.spec.ts`
- [ ] **Step 5: コミット** `fix(shares): show why sharing failed, announce copies, stop links of missing packs`

### Task 4: バージョンと README

**Files:** `package.json`, `package-lock.json`, `README.md`

- [ ] **Step 1:** v0.96.1 にし、README のバージョン節に変更点を書く（保存ごとのリンク削除、孤立リンクの停止、`name`、`X-Robots-Tag`、`/api/shared` のリクエスト数制限は Vercel Firewall の Rate Limit ルール（例: `/api/shared` に IP ごと 60 回/分）で設定すること）。
- [ ] **Step 2:** `npm test` と `node tests/i18n.test.cjs`
- [ ] **Step 3: コミット** `chore: v0.96.1`
