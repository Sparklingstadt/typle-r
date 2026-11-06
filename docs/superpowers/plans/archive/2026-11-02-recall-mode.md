# 思い出して打つモード 実装計画

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web 版に、答えを隠して意味だけを見せる「思い出して打つ」練習を入れ、その記録を `mode: "recall"` で通常の記録と分けて保存・比較する。

**Architecture:** 記録に任意の項目 `mode`（`"recall"` か項目なし）を足し、比べる処理はすべてモードで絞ってから今の語数での比較（`comparableRecords`）を行う。画面は練習画面のトグルで切り替え、答えの隠し方は純粋な関数 `recallPrompt` に閉じる。iPad/Mac（TypleCore）は `mode` を保ち、比較から外すだけ。

**Tech Stack:** Next.js 16 / React 19 / TypeScript、Go 1.25、Swift（TypleCore）、node --test、go test、Playwright、swift test

**Spec:** `docs/superpowers/specs/2026-11-02-recall-mode-design.md`

## Global Constraints

- `mode` の値は `"recall"` か項目なしだけ。ほかの値は `invalidRecord`（Web の `addRecord`・Go の `AddRecord`）、読み込み時は `savedDataCorrupted`（Web）／デコードのエラー（Go）。
- 通常の練習の記録には `mode` を書かない（今ある記録の形を変えない）。
- 設定のキーは `typle-r:practice-mode`、値は `recall` のときだけ書く。
- ランキングページの URL は `?mode=recall`（通常のときは付けない）。
- 隠した文字は「＿」（全角）。補足の中で伏せる文字列は「＿＿」。
- 出す順番: typle-ipad v0.62.0 を先に、typle-r v2.7.0 を後に。typle-r の PR のタイトルは日本語の1文に ` (v2.7.0)`（CLAUDE.md）。
- 文言は 6 言語（ja・en・zh-CN・zh-TW・ru・fr）すべてに同じキーで入れる（`tests/i18n.test.cjs`）。iPad/Mac は ja・en。

## Review Focus

- 空白を含む入力（`cp -r src dst`、`git commit -m "..."`）: 隠すとき空白は空白のまま見せ、`＿` にしない。→ Task 6 のテスト。
- 補足を伏せた結果、句読点と `＿` しか残らない語（例: 補足が「ls」だけ）: `recallPrompt` は空文字を返し、画面は表示する文字か「ヒントがありません」を出す。→ Task 4・6 のテスト。
- iPad/Mac でアカウントを保存しても `mode` が消えない（PUT `/api/workspace` で全体を送るため）。→ Task 1 のテスト。
- 「答えを見る」を押した後の誤打鍵は通常どおりミスに数え、同じ語で2回押しても加算は1回。次の語に進むと再び押せる。→ Task 5 のテスト。
- 練習中（入力を始めてから結果が出るまで）はトグルを切り替えられず、結果画面からの「もう一度」は同じモードで始まる。→ Task 6・8 のテスト。

---

## Part A: typle-ipad（`/Users/liyur_qie/rossarte/typle-ipad`、ブランチ `recall-records`）

### Task 1: TypleCore で `mode` を保ち、比較から外す（v0.62.0）

**Files:**
- Modify: `TypleCore/Sources/TypleCore/Models.swift`（`StoredRecord`）
- Modify: `TypleCore/Sources/TypleCore/Records.swift`（`comparableRecords`、`RecordRow`）
- Modify: `TypleCore/Sources/TypleCore/Rankings.swift`（`listRanking`）、`Dashboard.swift`（`summarize` の平均正確率、`nextLists`、`listTrends`）
- Modify: `Shared/Records/RecordsView.swift`（行に印）、`Shared/Resources/{ja,en}.lproj/Localizable.strings`
- Modify: `project.yml`（`MARKETING_VERSION: "0.62.0"`）
- Test: `TypleCore/Tests/TypleCoreTests/TypleCoreTests.swift`、`DashboardTests.swift`

**Interfaces:**
- Produces: `StoredRecord.mode: String?`（JSON キー `mode`、`nil` のときは書き出さない）、`public func normalRecords(_ records: [StoredRecord]) -> [StoredRecord]`（`mode == nil` だけ）

- [ ] **Step 1: 失敗するテストを書く**
  - `testRecallModeSurvivesLocalAndAccountRoundTrip`: `"mode":"recall"` を持つ記録を含むローカル形式とアカウント形式の JSON を、それぞれ decode → encode して、出力に `"mode":"recall"` が残ること。`mode` のない記録の出力に `mode` キーがないこと。
  - `testRecallRecordsAreLeftOutOfBestsAndRankings`: 通常の記録（time 10）と recall の記録（time 5、同じ語数）を持つリストで、`listBest(list)?.time == 10`、`listRanking(list).ranked` に recall の記録が入らないこと。
  - `DashboardTests.testRecallRecordsCountForTheWeekButNotTrends`: recall の記録だけがあるリストは `listTrends` に出ず `nextLists` で `.new` 扱い、`summarize` の今週の回数には数えること。
- [ ] **Step 2: `cd TypleCore && swift test` で上の3つが失敗することを確かめる**
- [ ] **Step 3: 実装する**
  - `StoredRecord` に `mode: String?` を足し、`init` に `mode: String? = nil` を足す（自動生成の `Codable` は `nil` を書き出さない）。
  - `comparableRecords` は `normalRecords` で絞ってから語数で比べる。`listRanking`・`nextLists`・`listTrends`・`summarize` の平均正確率は `normalRecords` を使う。`summarize` の回数・連続日数・練習時間はすべての記録。
  - `RecordsView` の行で `record.mode == "recall"` のとき文言 `records.recallBadge`（ja「思い出す」、en「Recall」）の印を出す。
- [ ] **Step 4: `swift test`、`node --test tests/`、`TypleiPad`・`TypleMac` の両方のビルドが通ることを確かめる**
- [ ] **Step 5: コミットして PR を作る**（タイトル: `Keep practice records' mode and leave recall records out of bests (v0.62.0)`）

---

## Part B: typle-r（`/Users/liyur_qie/rossarte/typle-r`、ブランチ `feat/recall-mode`）

### Task 2: Go のサーバーで `mode` を保ち、検証し、比較から外す

**Files:**
- Modify: `server/internal/workspace/workspace.go`（`Record`・`rawRecord`・`decodeRecord`・`rawRecord.UnmarshalJSON` の既知キー）
- Modify: `server/internal/workspace/records.go`（`RecordInput`・`AddRecord`）
- Modify: `server/internal/workspace/rank.go`（`comparable`）、`dashboard.go`（`Summarize` の平均正確率・`NextLists`・`ListTrends`）、`rankings.go`（`ListRanking`）
- Create: `tests/fixtures/records/mode-recall.json`・`mode-invalid.json`（TS と Go が共有する例。1ファイル1例の既存の形に合わせる）
- Test: `server/internal/workspace/*_test.go`、`server/internal/web/records_test.go`、`server/internal/api/*_test.go`

**Interfaces:**
- Produces: `Record.Mode string`（JSON `mode,omitempty`）、`RecordInput.Mode *string`（JSON `mode`）、`const RecallMode = "recall"`

- [ ] **Step 1: 失敗するテストを書く**
  - `TestDecodeRecordMode`: `"mode":"recall"` は `Mode == "recall"` で読め、書き出しに残る。`"mode":"x"` と `"mode":""` はエラー。`mode` なしは `Mode == ""` で、書き出しに `mode` キーがない。`Extra` に `mode` が入らないこと。
  - `TestAddRecordKeepsMode`: `RecordInput{Mode: ptr("recall")}` で追加した記録の `Mode == "recall"`。`Mode: ptr("other")` は `invalidRecord`。
  - `TestComparableLeavesOutRecall`: `ListBest` と `ListRanking` に recall の記録が入らない。`ListTrends` に recall だけのリストが出ない。
  - `web`: `POST /api/workspace/records` に `record.mode = "recall"` を送ると 201 で、続く `GET /api/workspace` の記録に `mode` が残る。`PUT /api/workspace` で送った `mode` も残る。
  - `api`（`/api/v1`）: `POST /api/v1/lists/{id}/records` に `mode` を付けると今と同じく 400。
  - fixture: `mode-recall.json`（recall の記録が `mode` を保って追加される）、`mode-invalid.json`（`mode: "x"` は `invalidRecord`）。
- [ ] **Step 2: `go test ./server/...` で失敗することを確かめる**
- [ ] **Step 3: 実装する**（`rawRecord.Mode *string`、既知キーの一覧に `"mode"`、`decodeRecord` で `"recall"` 以外を拒否、`AddRecord` で `Mode` を写す、`comparable` と dashboard の3か所で `Mode == ""` に絞る）
- [ ] **Step 4: `gofmt -l .`（空）、`go vet ./...`、`go test ./...` が通ることを確かめる**
- [ ] **Step 5: コミット**（`記録の mode を Go のサーバーで保ち、比べるときに分ける`）

### Task 3: Web の記録の型・検証・比べ方に `mode` を足す

**Files:**
- Modify: `src/core/records.ts`、`src/core/wordLists.ts`（保存された記録の型と読み込みの検証）、`src/core/rankings.ts`、`src/core/dashboard.ts`、`src/core/listOverview.ts`（`currentRecordCount`）
- Test: `tests/records.test.cjs`（既存）、`tests/rankings.test.cjs`、`tests/dashboard.test.cjs`、fixture を読むテスト（Task 2 で足した `mode-*.json` も通ること）

**Interfaces:**
- Produces:
  - `export type PracticeMode = 'normal' | 'recall'`
  - `export function recordMode(record: { mode?: string }): PracticeMode`
  - `export function recordsOfMode<T extends { mode?: string }>(records: T[], mode: PracticeMode): T[]`
  - `PracticeRecord.mode?: 'recall'`、`RecordInput` も同じ
  - `makeRecord(session, wordCount, id, device?, mode: PracticeMode = 'normal')`（`recall` のときだけ `mode: 'recall'` を付ける）
  - `comparableRecords(list, records = list.records, mode: PracticeMode = 'normal')`（モードで絞ってから語数で比べる）
  - `listBest(list, mode: PracticeMode = 'normal')`
  - `RankingOptions.mode?: PracticeMode`（既定 `'normal'`）

- [ ] **Step 1: 失敗するテストを書く**
  - `addRecord keeps mode recall and rejects other modes`: `mode: 'recall'` は保存された記録に残る。`mode: 'x'` は `invalidRecord`。`mode` なしの記録に `mode` キーがない。
  - `saved records with an unknown mode are corrupted`: 読み込みで `mode: 'x'` は `savedDataCorrupted`、`'recall'` は通る。
  - `comparableRecords and listBest compare records of one mode`: 通常 time 10・recall time 5 で、`listBest(list).time === 10`、`listBest(list, 'recall').time === 5`。
  - `listRanking ranks the chosen mode`: `{ mode: 'recall' }` で recall の記録だけ。
  - `dashboard trends and next lists use normal records; the week counts all`。
- [ ] **Step 2: `npm test` で失敗することを確かめる**
- [ ] **Step 3: 実装する**（`addRecord` は組み直す記録に `mode` を写す。`summarize` の平均正確率・`nextLists`・`listTrends` は `recordsOfMode(…, 'normal')`）
- [ ] **Step 4: `npm test`、`npm run typecheck` が通ることを確かめる**
- [ ] **Step 5: コミット**（`Web の記録に mode を足し、比べるときにモードで分ける`）

### Task 4: `recallPrompt` で補足から答えを伏せる

**Files:**
- Create: `src/core/recallPrompt.ts`
- Test: `tests/recallPrompt.test.cjs`

**Interfaces:**
- Produces: `export function recallPrompt(word: { display: string; input: string; annotation: string }): string`

- [ ] **Step 1: 失敗するテストを書く**（期待値はそのまま）

| word（display / input / annotation） | 期待 |
|---|---|
| apple / apple / `apple / りんご` | `りんご` |
| 苹果 / pingguo / `píngguǒ / りんご` | `りんご` |
| 阿富汗 / afuhan / `Āfùhàn / アフガニスタン` | `アフガニスタン` |
| cp -r src dst / 同 / `cp：ファイルをコピー` | `＿＿：ファイルをコピー` |
| git status / 同 / `Git の状態を見る` | `＿＿ の状態を見る` |
| 42601 / 42601 / `syntax_error：構文エラー` | `syntax_error：構文エラー` |
| ls / ls / `ls` | `` |
| hello / hello / `` | `` |

- [ ] **Step 2: `node --test tests/recallPrompt.test.cjs` で失敗することを確かめる**
- [ ] **Step 3: 実装する**（答えの候補 = input・display・input の最初の空白までの部分（2文字以上）。NFD にして結合文字を除き小文字にして比べる。「 / 」があれば候補を含む部分を除いて「 / 」でつなぐ。なければ候補を長い順に `＿＿` に置き換える（元の文字列の位置で置き換えるため、正規化は1文字ずつ対応を取って行う）。残りが句読点・空白・`＿` だけなら空文字）
- [ ] **Step 4: テストが通ることを確かめる**
- [ ] **Step 5: コミット**（`補足から答えを伏せる recallPrompt を足す`）

### Task 5: 「答えを見る」を判定に足す

**Files:**
- Modify: `src/core/typing.ts`（`TypingSession`・`newSession`・`typeInput` の次の語へ進むところ）
- Test: `tests/typing.test.cjs`（既存）

**Interfaces:**
- Produces: `TypingSession.revealed: boolean`（今の語で答えを見たか。次の語に進むと `false`）、`export function revealAnswer(session: TypingSession, words: { input: string }[], now: number): TypingSession`

- [ ] **Step 1: 失敗するテストを書く**
  - `revealAnswer adds the untyped characters to attempts and mistakes once`: `pwd` で `p` を打った後 `revealAnswer` → `attempts`・`mistakes` が 2 増え `revealed === true`。もう一度呼んでも変わらない。
  - `typing after revealing still counts wrong keys`: 答えを見た後の誤打鍵で `mistakes` が 1 増える。
  - `moving to the next word clears revealed`: 語を打ち切ると `revealed === false`、次の語で再び加算できる。
  - `revealing starts the clock`: 打つ前に呼ぶと `startedAt` が `now`。
- [ ] **Step 2: `npm test` で失敗することを確かめる**
- [ ] **Step 3: 実装する**（残りの文字数はコードポイントで数える。`finishedAt` があるときは何もしない）
- [ ] **Step 4: テストが通ることを確かめる**
- [ ] **Step 5: コミット**（`答えを見たときに残りの文字をミスに数える`）

### Task 6: 練習画面に「思い出して打つ」を入れる

**Files:**
- Create: `src/lib/practiceMode.ts`（`src/lib/liveStats.ts` と同じ形）
- Modify: `src/lib/usePractice.ts`（`makeRecord` に mode を渡す、`revealAnswer` を出す）
- Modify: `src/app/(workspace)/play/page.tsx`、`src/components/Practice/TargetText.tsx`、`src/components/Practice/PracticeResult.tsx`、`src/components/Practice/PracticeBestRecords.tsx`
- Modify: `src/messages/{ja,en,zh-CN,zh-TW,ru,fr}/practice.json`
- Test: `tests/practiceMode.test.cjs`、`tests/targetText.test.cjs`（`concealed` の文字の作り方を純粋な関数として切り出して確かめる）

**Interfaces:**
- Consumes: Task 3 の `PracticeMode`・`makeRecord`・`listBest`・`comparableRecords`、Task 4 の `recallPrompt`、Task 5 の `revealAnswer`・`revealed`
- Produces:
  - `src/lib/practiceMode.ts`: `export function usePracticeMode(): [PracticeMode, (mode: PracticeMode) => boolean]`
  - `TargetText` の prop `concealed?: boolean`（`pending`・`current` の文字を `＿` で見せ、空白はそのまま。`revealed` のときは使わない）
  - `src/core/typing.ts` か `TargetText` の隣に `export function concealCharacters(characters: string[], states: CharacterState[]): string[]`
  - 文言キー（`practice.json`）: `recall.toggle`（ja「思い出して打つ」）、`recall.reveal`（「答えを見る」）、`recall.noHint`（「ヒントがありません」）、`recall.resultHeading`（「思い出して打つ」）

- [ ] **Step 1: 失敗するテストを書く**
  - `concealCharacters hides untyped characters but keeps spaces`: `cp -r` を `c` まで打った状態 → `['c','＿',' ','＿','＿']`（空白は半角のまま）。
  - `the practice mode is read from typle-r:practice-mode and written only for recall`。
- [ ] **Step 2: 失敗することを確かめる**
- [ ] **Step 3: 実装する**
  - トグルはライブ指標の表示ボタンの隣。練習中（`startedAt !== null && finishedAt === null`）は `disabled`。切り替えると今の練習を最初からにする。
  - recall のとき: 補足の代わりに `recallPrompt(word)`、空なら表示する文字（`display !== input` かつ `input_type !== 'code'`）、それもなければ `recall.noHint`。答えの欄は `TargetText concealed`（`revealed` のときは通常どおり）。「答えを見る」ボタン（`revealed` の間は押せない）。次の単語・すべての単語・簡易入力のキー・`TargetText guide` を出さない。
  - 結果画面の見出しに `recall.resultHeading`。ベストとの差・右のベスト5件は今のモードの記録で比べる。
  - 6 言語の文言を足す。
- [ ] **Step 4: `npm test`、`npm run typecheck`、`npm run lint` が通ることを確かめる**
- [ ] **Step 5: コミット**（`練習画面に思い出して打つモードを入れる`）

### Task 7: ベスト記録ページの切り替えと練習記録の印

**Files:**
- Modify: `src/app/(workspace)/rankings/page.tsx`、`src/components/Rankings/*`（並べ替えの切り替えと同じ場所にモードの切り替え）
- Modify: `src/app/(workspace)/records/page.tsx` か `src/components/Records/*`（行の印）
- Modify: `src/messages/*/rankings.json`、`src/messages/*/records.json`

**Interfaces:**
- Consumes: Task 3 の `RankingOptions.mode`、`recordMode`
- Produces: 文言キー `rankings.mode.normal`（「通常」）・`rankings.mode.recall`（「思い出す」）、`records.recallBadge`（「思い出す」）

- [ ] **Step 1: 実装する**（URL の `mode` は `recall` のときだけ付け、ほかの値は通常として扱う。並べ替え・端末の URL パラメーターと同じ読み書き）
- [ ] **Step 2: `npm test`（i18n のキーの一致）、`npm run typecheck`、`npm run lint` が通ることを確かめる**
- [ ] **Step 3: コミット**（`ベスト記録ページで思い出して打った記録を切り替えて見られるようにする`）

### Task 8: E2E と文書、v2.7.0

**Files:**
- Create: `tests/e2e/recall.spec.ts`
- Modify: `README.md`（練習の説明に1段落）、`src/components/Guide/*` か `src/messages/*/guide.json`（使い方に1項目）、`package.json`（`npm version 2.7.0 --no-git-tag-version`）

- [ ] **Step 1: E2E を書く**
  - `recall mode hides the answer and saves a recall record`: ゲストで公式の英語の基礎のリストを選び、トグルを入れる → 補足が「/」の前を含まない、次の単語のチップ・すべての単語・「入力する文字」の案内がない → 最後まで打つ → LocalStorage の記録に `mode: 'recall'`。
  - `revealing the answer counts the rest as mistakes`: 「答えを見る」→ ミスの表示が残りの文字数だけ増え、ボタンが押せなくなる。
  - `the toggle is locked while practising`: 1文字打った後はトグルが `disabled`。
  - `rankings separate recall records`: 通常1回・recall 1回の後、`/rankings` の既定に recall の記録がなく、`?mode=recall` にある。
- [ ] **Step 2: `npm run test:e2e -- recall` が通ることを確かめる**
- [ ] **Step 3: 全体の確認**（`gofmt -l .`、`go vet ./...`、`go test ./...`、`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run test:e2e`）
- [ ] **Step 4: 文書と版を更新してコミットし、PR を作る**（タイトル: `練習に思い出して打つモードを入れ、その記録を通常の記録と分けて比べる (v2.7.0)`。typle-ipad の PR（Task 1）が先にマージされていること）
