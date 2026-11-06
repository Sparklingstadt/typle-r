# 単語パック PR 4（記録・ベスト記録をパックでまとめる）Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録の画面にパックの絞り込みを、ベスト記録の画面にパックごとのまとまりと集計を足し、リスト名を出す残りの場所を「パック名 › リスト名」にする（v0.94.0）。

**Architecture:** 記録の保存はリストごとのまま。パックごとの集計と絞り込みを純粋な関数として `src/core/packRecords.ts` に置き、画面はそれを使って表示を変えるだけにする。保存形式・API は変えない。

**Tech Stack:** TypeScript（Next.js 16・React 19・next-intl）、`node --test`、Playwright

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（「5. 記録・ランキング」と「実装の分け方」の PR 4）。前提は v0.93.0（`src/core/packEditing.ts` の `packOverviews`、`src/core/packPractice.ts` の `practiceName`、`src/components/PracticeName.tsx`）。

## spec からの変更（この計画で決めたこと）

- **ベスト記録の画面の並び替え（最近・名前・回数）はパック単位にし、パックの中のリストは保存順（難易度の順）に並べる。** spec は並べ方を書いていない。
- **記録の画面の絞り込みの URL は `?pack=<id>&list=<id>&device=<id>`。** パックを選ぶとリストの選択肢はそのパックのリストだけになる。
- **練習画面の結果と右側のベスト記録の見出しも「パック名 › リスト名」にする**（PR 3 で後回しにした分）。

## Global Constraints

- 記録・ベスト記録の比べ方（`listRanking`・`comparableRecords`・`listBest`）は変えない。
- パックの集計（spec 5節）: 練習回数の合計・練習済みのリスト数（記録が1件以上あるリスト）/リスト数・最後に練習した日時・`IMPROVED_DAYS`（7）日以内に記録を更新したリストの数（`listRanking` の `improved`）。端末で絞っているときは、その端末の記録だけで数える。
- 表示名は `practiceName`・`PracticeName`・`usePracticeName` を使う（区切りは `common.packList`）。
- URL `?list=<id>` は今までどおりそのリストを開く・絞り込む。
- 画面の文言は6言語（`ja`・`en`・`zh-CN`・`zh-TW`・`ru`・`fr`）。用語は ja パック、en pack、zh-CN/zh-TW 包、ru набор、fr pack。フランス語のアポストロフィは ’。
- 出力・コミットメッセージ・README は日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **端末で絞り込んだとき**: パックの見出しの集計も、その端末の記録だけで数えられる（Task 1・2）。
2. **記録のないパック**: ベスト記録の画面で「記録なし」のまとまりに入り、開いて練習できる（Task 2）。
3. **記録の画面でパックを選んだあとリストの選択肢を変える・パックを外す**: リストの絞り込みが矛盾しない（パックを変えたら、そのパックにないリストの選択は外す）（Task 3）。
4. **`?list=<id>` だけの古いリンク**（練習の結果やホームから）: 今までどおりそのリストで開く（Task 2・3）。
5. **1リストのパック**: ベスト記録の画面では今の1行の表示のまま、見出しを出さない（Task 2）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/core/packRecords.ts`（新） | `packRankings`・`sortPackRankings`・`matchesRankingQuery`・`packRecordOptions` |
| `tests/packRecords.test.cjs`（新） | その単体テスト |
| `src/core/records.ts` | `RecordFilter` に `pack`、`filterRows` でパックを絞る |
| `src/components/Rankings/RankingList.tsx`・`RankingDetail.tsx`・`TopRecords.tsx`、`src/app/(workspace)/rankings/page.tsx` | パックごとのまとまりと見出しの集計、表示名 |
| `src/app/(workspace)/records/page.tsx`・`src/components/Records/*` | パックの絞り込み、表示名 |
| `src/components/WordLists/PackRow.tsx` | 「練習済み 8/11」 |
| `src/app/(workspace)/play/page.tsx`・`src/components/Practice/PracticeResult.tsx` | 結果と右側のベスト記録の見出しの表示名 |
| `src/messages/*/rankings.json`・`records.json`・`wordLists.json`・`practice.json` | 文言（6言語） |
| `tests/e2e/*` | 画面の確認 |
| `README.md`・`package.json`・`package-lock.json`・`src/messages/*/guide.json` | v0.94.0 |

---

### Task 1: パックの集計と絞り込みの関数（core）

**Files:**
- Create: `src/core/packRecords.ts`、`tests/packRecords.test.cjs`
- Modify: `src/core/records.ts`（`RecordFilter`・`filterRows`）、`tests/records.test.cjs`

**Interfaces:**
- Consumes: `ListRanking`・`ListSort`（`rankings.ts`）、`PackOverview`・`packOverviews`（`packEditing.ts`）、`WordPack`、`RecordRow`
- Produces:
  ```ts
  export type PackRanking = {
    pack: WordPack
    /** 中のリストのランキングを保存順に。 */
    items: ListRanking[]
    practiceCount: number        // items の records.length の合計（端末で絞った後）
    practicedListCount: number   // records が1件以上の item の数
    lastPracticed: Date | null   // items の lastPracticed の最大
    improvedCount: number        // improved が true の item の数
  }
  /** rankings はリストごと（端末で絞った後）。packs の保存順で、リストのないパックは出さない。 */
  export function packRankings(packs: WordPack[], rankings: ListRanking[]): PackRanking[]
  /** recent: lastPracticed の新しい順（ないものは後ろ）、name: パック名、count: practiceCount の多い順（同じなら recent）。同じなら保存順。 */
  export function sortPackRankings(items: PackRanking[], sort: ListSort, locale?: string): PackRanking[]
  /** パック名かリスト名（大文字小文字を区別しない）。当たったリストの id を返す。パック名で当たれば全リスト。 */
  export function matchesRankingQuery(item: PackRanking, query: string): string[]
  /** 記録の画面のパックの絞り込みの選択肢: 記録のあるパックだけ、保存順、count は記録の数。 */
  export function packRecordOptions(packs: WordPack[], lists: SavedWordList[]): { value: string; label: string; count: number }[]
  ```
- `records.ts`: `RecordFilter = { pack: string | null; list: string | null; device: string | null }`。`filterRows` は `pack` があれば `row.list.packId === pack` で絞る。

- [ ] **Step 1: 失敗するテストを書く**
- `packRankings`: パック `p`（リスト `a` 記録2件・`b` 記録0件）、`q`（`c` 記録1件、`improved`）。`p` の `practiceCount` 2、`practicedListCount` 1、`items` が `a`・`b` の順。`q` の `improvedCount` 1。端末で絞った `listRanking` を渡すと、その記録だけで数える。
- `sortPackRankings`: `recent`・`name`・`count` のそれぞれと、同じときの保存順。
- `matchesRankingQuery`: パック名で全リスト、リスト名で該当のリストだけ、当たらなければ空。
- `packRecordOptions`: 記録のないパックは出ない。count は中のリストの記録の合計。
- `filterRows`: `pack` だけ、`pack` と `list`、`pack` と `device`。

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/packRecords.test.cjs tests/records.test.cjs`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS（`RecordFilter` に `pack` を足したことで画面の型が合わなければ、`records/page.tsx` に `pack: null` を足すだけにとどめる。画面の変更は Task 3）

- [ ] **Step 5: コミット**

```bash
git add src/core tests
git commit -m "feat: 記録とベスト記録をパックでまとめる関数を追加する"
```

---

### Task 2: ベスト記録の画面をパックごとに

**Files:**
- Modify: `src/app/(workspace)/rankings/page.tsx`、`src/components/Rankings/RankingList.tsx`・`RankingDetail.tsx`・`TopRecords.tsx`、`src/messages/*/rankings.json`（6言語）
- Test: `tests/e2e/rankings.spec.ts`、`tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `packRankings`・`sortPackRankings`・`matchesRankingQuery`、`useWordLists()` の `packs`、`PracticeName`・`usePracticeName`、`levelName`
- Produces: `RankingList({ packs: PackRanking[], selectedId, filtered, sort, onSort, now, onChoose })`

画面の決めごと（spec 5節）:
- 左の一覧: 記録のあるパックを `sortPackRankings` の順で。2つ以上のリストのパックは見出し（`li` に `data-pack-id`、パック名と集計「{runs}回・練習済み {practiced}/{lists}・{最後に練習した日}・更新 {improved}」）の下に、各リストの行（今の `ListItem`。名前は `levelName(list)`）を保存順で。記録のないリストの行は、そのパックの中で「記録なし」の見た目（今の未練習の行と同じ）にする。
- 1リストのパックは今と同じ1行（見出しなし）。名前は `PracticeName`。
- 記録が1件もないパックは、今の「記録なし」のまとまり（`noRecords`）にパック単位で入れる（2つ以上のリストのパックは「パック名 · Nリスト」で、押すと最初のリストを開く）。
- 検索は `matchesRankingQuery`。当たったリストだけを出し、見出しは残す。
- 右の詳細: 見出し（`ranking-title`）と表・グラフの `aria-label` の名前を `PracticeName`・`usePracticeName` に。
- `?list=<id>` と端末・並べ方の URL は今のまま。

- [ ] **Step 1: 失敗する E2E を書く**
- 2つ以上のリストのパックの見出しに「練習済み 1/2」などの集計が出て、その下にリストの行がある。
- 端末で絞り込むと、見出しの練習回数がその端末の記録の数になる。
- 1リストのパックは見出しがなく、1行。
- パック名で検索すると、そのパックのリストがすべて出る。
- `?list=<id>` で開くと、そのリストの詳細が開き、見出しが「パック名 › …」。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts tests/e2e/rankings.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` は負荷でたまに落ちるもの）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: ベスト記録の画面をパックごとにまとめ、パックの集計を出す"
```

---

### Task 3: 記録の画面のパックの絞り込みと表示名

**Files:**
- Modify: `src/app/(workspace)/records/page.tsx`、`src/components/Records/RecordRow.tsx`・`ListSummary.tsx`、`src/messages/*/records.json`（6言語）
- Test: `tests/e2e/records.spec.ts`、`tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `packRecordOptions`・`RecordFilter.pack`・`filterRows`、`useWordLists()` の `packs`、`PracticeName`・`usePracticeName`

画面の決めごと:
- 絞り込みの並び: 「パック」（新、`FilterMenu`、選択肢は `packRecordOptions`）、「リスト」、「端末」。
- パックを選ぶと、リストの選択肢はそのパックのリストだけ。選んでいたリストがそのパックにないときは、リストの選択を外す。パックの選択を外しても、リストの選択は残す。
- `?list=<id>` だけで開いたとき（ほかの画面からのリンク）は、パックは選ばない（今と同じ表示）。
- 各記録の行の名前（`showList` のとき）と、削除の確認・通知の名前を `usePracticeName` に。`ListSummary` の見出しを `PracticeName` に。
- 1つのパックに絞っているときは、行の名前を `levelName(list)` だけにしてもよい（同じパック名の繰り返しを避ける）。

- [ ] **Step 1: 失敗する E2E を書く**
- 「パック」の絞り込みでパックを選ぶと、そのパックのリストの記録だけが出て、URL に `pack=` が付く。リストの選択肢はそのパックのリストだけ。
- パックを選んだあと別のパックに変えると、前のパックのリストの選択が外れる。
- 2つ以上のリストのパックの記録の行に「パック名 › …」が出る。
- `?list=<id>` で開くと、今までどおりそのリストの記録だけが出る。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts tests/e2e/records.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: 記録の画面でパックで絞り込み、記録にパック名を出す"
```

---

### Task 4: パックの一覧の「練習済み」と練習画面の結果の表示名

**Files:**
- Modify: `src/components/WordLists/PackRow.tsx`、`src/app/(workspace)/play/page.tsx`、`src/components/Practice/PracticeResult.tsx`、`src/messages/*/wordLists.json`・`practice.json`（6言語）
- Test: `tests/e2e/packs.spec.ts`・`practice.spec.ts`

**Interfaces:**
- Consumes: `PackOverview.practicedListCount`、`PracticeName`・`usePracticeName`

画面の決めごと:
- 単語パックの画面（`/edit`）の各行の練習の状況に「練習済み {practiced}/{lists}」を足す（2つ以上のリストのパックだけ。1リストのパックは今のまま）。
- 練習画面の結果（`PracticeResult` の `listName`）と、右側のベスト記録のまとまりの名前を `usePracticeName` に。

- [ ] **Step 1: 失敗する E2E を書く**
- `/edit` の2つ以上のリストのパックの行に「練習済み 1/2」が出る。1リストのパックには出ない。
- 2つ以上のリストのパックのリストで練習を終えると、結果に「パック名 › …」が出る。

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
git commit -m "feat: パックの一覧に練習済みのリスト数を出し、練習の結果をパック名付きで表示する"
```

---

### Task 5: README・ガイドと v0.94.0

**Files:**
- Modify: `README.md`（「## v0.93.0」の前に v0.94.0）、`package.json`・`package-lock.json`、`src/messages/*/guide.json`（記録とベスト記録の説明、6言語）

- [ ] **Step 1: 書く**

README「## v0.94.0 — 記録とベスト記録をパックでまとめました」: ベスト記録の画面のパックごとのまとまりと集計、記録の画面のパックの絞り込み、「パック名 › リスト名」の表示の範囲、単語パックの画面の「練習済み」、spec からの変更（パック単位の並べ替え、URL の `pack=`）。ガイドの記録・ベスト記録の説明を同じ内容に直す。`npm version 0.94.0 --no-git-tag-version`。

- [ ] **Step 2: 全体を確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && (cd server && go test ./... && go vet ./...) && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add README.md package.json package-lock.json src/messages
git commit -m "docs: v0.94.0 の記録とベスト記録のパックのまとめ方を README とガイドに書く"
```

リリースは `docs/release-workflow.md` の順（PR → squash merge → verify → Release → デプロイ）。
