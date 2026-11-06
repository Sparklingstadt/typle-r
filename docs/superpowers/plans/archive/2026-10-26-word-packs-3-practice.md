# 単語パック PR 3（練習画面でパックから選ぶ）Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 練習画面と単語一覧のリストの選び方をパック単位にし、ホームなどリスト名を出すところを「パック名 › リスト名」にする（v0.93.0）。

**Architecture:** 選び方の決まり（並び順・パックの中のリストの順・表示名）を純粋な関数として `src/core/packPractice.ts` に置き、`WordListOptions` を `PackOverview` を受け取る部品に作り替える。練習の単位はリストのまま（`/play?list=<id>`）。保存形式・API は変えない。

**Tech Stack:** TypeScript（Next.js 16・React 19・next-intl）、`node --test`、Playwright

**Spec:** `docs/superpowers/specs/2026-10-26-word-packs-design.md`（「3. 選ぶ・練習する」と「実装の分け方」の PR 3）。前提は v0.92.0（`src/core/packEditing.ts` の `packOverviews`・`matchesPackQuery`、`src/core/wordPacks.ts` の `viewLists`）。

## spec からの変更（この計画で決めたこと）

- **「リスト名を出すところ」の範囲**は、練習画面の見出し・単語一覧（`/words`）の見出し・ホームの「次に練習する」と「傾向」。記録とベスト記録の画面は PR 4（5節）で直す。
- **検索**は管理画面と同じ `matchesPackQuery`（パック名・カテゴリ・タグ・リスト名・単語）にする。今の練習画面の検索は単語を探さないが、spec の「2節の一覧と同じ」に合わせる。

## Global Constraints

- 練習の単位はリスト。URL は `/play?list=<id>`・`/words?list=<id>` のまま。
- 表示名: リストが `group`（画面用の形で、2つ以上のリストを持つパック、または `levels` のあるリストに付く）を持つときは `{パック名} › {levelName(list)}`、持たないときはリスト名。区切りの「›」は文言（6言語）に置き、言語ごとに変えられるようにする（ja `{pack} › {list}`）。
- パックの並びは最近練習した順（パックの中で最後に練習したリストの日時。記録のないパックは後ろで、保存順）。
- パックの中の選択肢は、`levels` のあるリストを先、ないリストを後に、それぞれ保存順。
- 画面の文言は6言語（`ja`・`en`・`zh-CN`・`zh-TW`・`ru`・`fr`）。用語は ja パック、en pack、zh-CN/zh-TW 包、ru набор、fr pack。フランス語のアポストロフィは ’。
- 出力・コミットメッセージ・README は日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **1リストのパック**: 選ぶとすぐそのリストに切り替わり、開く段階がない（Task 2）。
2. **`levels` のあるリストとないリストが混ざるパック**: `levels` のあるものが先に出て、ないものは名前のボタンで選べる（Task 1・2）。
3. **練習中に別のパックのリストを選ぶ**: 今の「中断してよいか」の確認がそのまま出る（Task 2 の E2E）。
4. **検索で何も当たらない・カテゴリの絞り込み**: 今と同じ「一致なし」の表示（Task 2）。
5. **リストを改名・削除した直後に練習画面を開く**: 選んでいたリストがないときの今の表示（`notFound`）がそのまま出る（Task 2）。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/core/packPractice.ts`（新） | `packsByRecentPractice`・`packChoices`・`practiceName` |
| `tests/packPractice.test.cjs`（新） | その単体テスト |
| `src/components/Practice/WordListOptions.tsx` | パック単位の選択肢（`PackOption`）に作り替える |
| `src/components/Practice/CategorySelect.tsx` | パックのカテゴリで絞る（`listLabels(packs)`） |
| `src/app/(workspace)/play/page.tsx`・`words/page.tsx` | パックで並べ・検索・絞り込み、見出しを `practiceName` に |
| `src/components/Dashboard/Dashboard.tsx` | 「次に練習する」「傾向」の名前を `practiceName` に |
| `src/messages/*/practice.json`・`dashboard.json`・`common.json` | 文言（6言語） |
| `tests/e2e/*` | 画面の確認 |
| `README.md`・`package.json`・`package-lock.json`・`src/messages/*/guide.json` | v0.93.0 |

---

### Task 1: 選び方の関数（core）

**Files:**
- Create: `src/core/packPractice.ts`、`tests/packPractice.test.cjs`

**Interfaces:**
- Consumes: `PackOverview`・`packOverviews`（`packEditing.ts`）、`levelName`（`listOverview.ts`）
- Produces:
  ```ts
  /** 最近練習した順（lastPracticed の新しい順）。記録のないパックは後ろで、保存順（position の小さい順）。 */
  export function packsByRecentPractice(items: PackOverview[]): PackOverview[]
  /** パックの中の選択肢: levels のあるリストを先、ないリストを後に、それぞれ保存順。 */
  export function packChoices(item: PackOverview): SavedWordList[]
  /** 表示名の部品。group のあるリストは { pack, list: levelName(list) }、ないリストは { list: list.name }。
   *  画面は文言 `common.packList`（{pack} › {list}）で組み立てる。 */
  export function practiceName(list: Pick<SavedWordList, 'name' | 'group' | 'levels'>): { pack?: string; list: string }
  ```

- [ ] **Step 1: 失敗するテストを書く**

`tests/packPractice.test.cjs`（書き方は `tests/packEditing.test.cjs` に合わせ、`packOverviews` で作ったものを入れる）:
- `packsByRecentPractice`: 記録の日時が `2026-10-02` のパック、`2026-10-05` のパック、記録のないパック2つ（保存順 1・0）→ `05`・`02`・保存順 0・1 の順。
- `packChoices`: リスト `x`（levels なし）・`a`（`['基本','初級']`）・`y`（levels なし）・`b`（`['基本','上級']`）の順のパック → `a`・`b`・`x`・`y`。
- `practiceName`: `group` と `levels` のあるリスト → `{ pack: 'Linux', list: '基本・初級' }`。`group` があり `levels` がないリスト → `{ pack: 'Linux', list: 'リスト名' }`。`group` のないリスト → `{ list: 'リスト名' }`。

- [ ] **Step 2: 失敗を確かめる**

Run: `node --test tests/packPractice.test.cjs`
Expected: FAIL（`Cannot find module`）

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/packPractice.ts tests/packPractice.test.cjs
git commit -m "feat: 練習でパックを選ぶ順番と表示名の関数を追加する"
```

---

### Task 2: 練習画面と単語一覧の選択肢をパック単位に

**Files:**
- Modify: `src/components/Practice/WordListOptions.tsx`、`src/components/Practice/CategorySelect.tsx`（型だけなら変更なし）、`src/app/(workspace)/play/page.tsx`、`src/app/(workspace)/words/page.tsx`、`src/messages/*/practice.json`（6言語）
- Test: `tests/e2e/practice.spec.ts`・`play.spec.ts`・`words.spec.ts`・`list-groups.spec.ts` のうち選択肢を見ている部分、`tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `packsByRecentPractice`・`packChoices`、`packOverviews`・`matchesPackQuery`・`matchingListIds`（`packEditing.ts`）、`levelSteps`・`listAtLevels`・`levelName`（`listOverview.ts`）、`useWordLists()` の `lists`・`packs`、`listLabels`・`matchesFilter`
- Produces: `WordListOptions({ packs: PackOverview[], selectedId, onSelect, label })` — `packs` は並べて絞り込んだ後のもの。各パックは `PackOption`（`li` に `data-pack-id`）。

画面の決めごと（spec 3節）:
- 1リストのパック: 今の単独のリストの選択肢と同じ見た目（リスト名・ラベル・語数とベスト）で、押すとそのリストを選ぶ。
- 2つ以上のリストのパック: 今の `GroupOption` と同じ開き方。見出しはパック名、ラベルはパックのもの。開くと `packChoices` の順で `levelSteps` の段を出す（`levels` のないリストは1段目の名前のボタン）。練習中のリストのパックは開いた状態で、選んでいる段を示す。
- 並び: `packsByRecentPractice(packOverviews({ packs, lists }))`。
- 検索: `matchesPackQuery`。検索中は、当たったパックの選択肢を開かずに出す（今と同じ）。
- カテゴリの絞り込み: `listLabels(packs)` と `matchesFilter(item.pack, …)`。
- `groupEntries` は使わなくなる。ほかに使っているところがなければ `listOverview.ts` から消し、`tests/listGroups.test.cjs` の該当テストも消す（`levelSteps`・`listAtLevels`・`levelName` は残す）。

- [ ] **Step 1: 失敗する E2E を書く**（`tests/e2e/packs.spec.ts` に追加。データの入れ方は今のファイルに合わせる）
- 練習画面の横の一覧に `data-pack-id` の選択肢がパックの数だけある。1リストのパックを押すと `/play?list=<そのリスト>` になり、見出しがリスト名になる。
- `levels` のあるリスト2つと、ないリスト1つのパックを開くと、1段目のボタンが `基本`（levels のあるもの）、続いてリスト名のボタンの順に並ぶ。`基本` → `初級` でそのリストを選ぶ。
- 練習を始めてから別のパックのリストを選ぶと、中断の確認が出る。
- パック名で検索すると、そのパックだけが出る。
- 単語一覧（`/words`）でも同じ選択肢から選べる。

既存の E2E のうち `li[data-group]` の選択肢を見ていたものは `data-pack-id` に直す（確かめる内容は変えない）。

- [ ] **Step 2: 失敗を確かめる**

Run: `npm run build && DATABASE_URL=<テスト用DB> npx playwright test tests/e2e/packs.spec.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS（`practice.spec.ts:257` は変更前から負荷でたまに落ちるもの）

- [ ] **Step 5: コミット**

```bash
git add src tests
git commit -m "feat: 練習画面と単語一覧でパックからリストを選ぶようにする"
```

---

### Task 3: 「パック名 › リスト名」の表示

**Files:**
- Modify: `src/app/(workspace)/play/page.tsx`（見出しのリスト名・切り替えボタンの名前）、`src/app/(workspace)/words/page.tsx`（見出しと `groupSummary`）、`src/components/Dashboard/Dashboard.tsx`（「次に練習する」「傾向」の名前と、練習ボタンの `aria-label`）、`src/messages/*/common.json`（`packList`、6言語）
- Test: `tests/e2e/dashboard.spec.ts`・`practice.spec.ts`・`words.spec.ts` の該当部分、`tests/e2e/packs.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `practiceName`
- Produces: `src/components/PracticeName.tsx`（新）`PracticeName({ list })` — `practiceName(list)` を `common.packList` で組み立てて表示する（パック名は少し薄い色）。文字列が要るところ（`aria-label`・`title`）用に `usePracticeName()`（`(list) => string`）も出す。

画面の決めごと:
- 練習画面の見出しのボタン（今 `list.name`）を `PracticeName` に。`header.switchList` の `{name}` は `usePracticeName()` の文字列。
- 単語一覧の見出しと、その下の `groupSummary`（今 `{group} › {level}` を組み立てている）を `PracticeName` に寄せ、同じ文言を2か所に出さない（見出しが「Linux › 基本・初級」なら、下の行は語数だけ）。
- ホームの「次に練習する」と「傾向」のリスト名を `PracticeName` に。練習ボタンの `aria-label` も同じ名前。
- 1リストのパック（`group` のないリスト）は今までどおりリスト名だけ。

- [ ] **Step 1: 失敗する E2E を書く**（`tests/e2e/packs.spec.ts` に追加）
- 2つ以上のリストのパックのリストで練習画面を開くと、見出しが「{パック名} › {難易度}」。1リストのパックではリスト名だけ。
- ホームの「次に練習する」に、2つ以上のリストのパックのリストが「{パック名} › …」で出る。

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
git commit -m "feat: 練習画面・単語一覧・ホームでリストを「パック名 › リスト名」で表示する"
```

---

### Task 4: README・ガイドと v0.93.0

**Files:**
- Modify: `README.md`（「## v0.92.0」の前に v0.93.0）、`package.json`・`package-lock.json`、`src/messages/*/guide.json`（練習の「リストと端末を選ぶ」などの説明をパックの選び方に、6言語）

- [ ] **Step 1: 書く**

README「## v0.93.0 — 練習画面でパックからリストを選ぶようにしました」: 選択肢がパック単位になったこと、1リストのパックはすぐ選ばれること、難易度の段階的な選び方、`levels` のないリストの扱い、検索が単語も探すようになったこと（spec からの変更）、「パック名 › リスト名」の表示の範囲（記録とベスト記録は後の版）。ガイドの練習の説明を同じ内容に直す。`npm version 0.93.0 --no-git-tag-version`。

- [ ] **Step 2: 全体を確かめる**

Run: `npm test && npm run typecheck && npm run lint && npm run build && (cd server && go test ./... && go vet ./...) && DATABASE_URL=<テスト用DB> npx playwright test`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add README.md package.json package-lock.json src/messages
git commit -m "docs: v0.93.0 の練習画面のパックの選び方を README とガイドに書く"
```

リリースは `docs/release-workflow.md` の順（PR → squash merge → verify → Release → デプロイ）。
