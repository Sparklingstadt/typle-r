# Typle Writing（typle-r 側）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 作者が印を付けたリストで、Web の「OS の手書き入力」による Writing の練習ができ、記録が `mode: 'writing'` として保存され、タイピングと分けて集計される。

**Architecture:** リストに `writing: { language }`、記録に `mode?: 'writing'` を足し、TS（`src/core`）と Go（`server/internal/workspace`）で同じ規則で検証する。集計の関数はそれぞれの中でタイピングの記録だけを使い、ベスト記録だけが `mode` を選べる。照合は `src/core/writing.ts` の純粋な関数で、入出力の例 `tests/fixtures/writing` を typle-ipad の Swift 版も読む。

**Tech Stack:** Next.js（`node_modules/next/dist/docs/` を先に読む）・TypeScript・next-intl、Go 1.25、`node --test`、Playwright

**Spec:** `docs/superpowers/specs/2026-11-02-typle-writing-design.md`

**範囲:** typle-r だけ。typle-ipad（`TypleCore` の写し・キャンバス・Vision）は、この計画の PR が本番に出てから別の計画で行う。公式パックへの印付けも別の PR。

## Global Constraints

- 言語の一覧は `'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'ko' | 'fr' | 'de' | 'es' | 'ru' | 'cs'` の10個。TS と Go で同じ順に持つ
- `writing` がないリストと `mode` がない記録は、今までと同じ（タイピング）。保存の形も変えない
- `mode` は「ない」か `'writing'` だけ。`'typing'` などほかの値は `invalidRecord`
- 照合：NFC、前後の空白を除き続く空白を1つに、`ja`・`zh-Hans`・`zh-Hant` は空白をすべて除く。入力の設定は `matchesCharacter` の規則。候補が1つでも一致すれば正解
- `accuracy` = 単語数 ÷（単語数 ＋ `mistakes`）× 100。`TypingSession` の `attempts` を「正解した語 ＋ ミス」として数え、既存の `sessionResult` をそのまま使う
- 「Typle Writing」「Writing」はどの言語でも英語のまま。新しい文言は6言語すべてに足す（`tests/i18n.test.cjs`）
- コードのコメントと識別子は英語、`docs/`・README・コミット・PR は日本語。PR とコミットのタイトルは日本語の1文に ` (vX.Y.Z)`
- `src/core`・`src/plugins` から画面への import は不可（`eslint.config.mjs`）
- リリースは `docs/release-workflow.md` のとおり。PR の版は `git tag` と GitHub Releases を見て未使用の番号（v2.7.0 の予定）

## Review Focus

1. **編集画面で印を外したとき**：外して保存すると `writing` が消える（`saveListInPack` は既存のリストの項目を広げるので、送らないと残ってしまう）→ Task 1 の `saveListInPack` のテスト
2. **空の入力欄で Enter**：ミスを数えない（何も書いていないのに罰しない）→ Task 5 の `judgeWriting` のテストと Task 7 の E2E
3. **IME の変換中の Enter**：変換の確定に使う Enter でミスを数えない → Task 7 の E2E
4. **リストの複製・パックのコピー・パックのファイル**：`writing` が写る → Task 1・Task 2 のテスト
5. **Writing を選んだまま印のないリストに切り替える**：タイピングに戻り、切り替えも消える → Task 7 の E2E

---

### Task 1: リストの印（TS）

**Files:**
- Modify: `src/core/wordLists.ts`（型・`isWritingLanguage`・`decodeLists`・`validateList`）
- Modify: `src/core/packEditing.ts:140-163`（`saveListInPack`）
- Modify: `src/core/packFile.ts`（`PackFile` の lists・`packFileOf`・`decodePackFile`・`addPackFile`）
- Modify: `src/messages/*/errors.json`（`invalidWritingLanguage`）
- Test: `tests/wordLists.test.cjs`・`tests/packEditing.test.cjs`・`tests/packFile.test.cjs`

**Interfaces:**
- Produces:
  - `export const WRITING_LANGUAGES = ['en','ja','zh-Hans','zh-Hant','ko','fr','de','es','ru','cs'] as const`
  - `export type WritingLanguage = typeof WRITING_LANGUAGES[number]`
  - `export const isWritingLanguage: (value: unknown) => value is WritingLanguage`
  - `WordList.writing?: { language: WritingLanguage }`
  - `saveListInPack` の `list` 引数に `writing?: { language: WritingLanguage }`。渡さなければ保存されたリストから消える

- [ ] **Step 1: 失敗するテストを書く**
  - `wordLists.test.cjs`「writing is kept, checked and optional」：`writing: { language: 'zh-Hans' }` のリストが `decodeLists(encodeLists(...))` で残る。`writing` のないリストは `'writing' in list === false`。`{ language: 'xx' }`・`{ language: 'ja', extra: 1 }`・`'ja'` は `decodeLists` で `savedDataCorrupted`、`validateList` で `invalidWritingLanguage`
  - `packEditing.test.cjs`「saveListInPack sets and removes writing」：印付きで保存→`writing` あり、同じ id を `writing` なしで編集保存→`writing` がない
  - `packFile.test.cjs`「pack file carries writing」：`packFileOf` の lists に `writing` が載り、`decodePackFile` が読み、`importPackFile` 後のリストにある。不正な言語は `packFileUnreadable`。`duplicateList`（`listOverview.ts`）と `copyPack` の結果にも `writing` がある

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/wordLists.test.cjs tests/packEditing.test.cjs tests/packFile.test.cjs` Expected: 上の新しいテストが FAIL

- [ ] **Step 3: 実装する** — `writing` は `{ language }` だけを持つオブジェクトのとき有効。`decodeLists` の大きな条件式に `(list.writing !== undefined && !isWritingObject(list.writing))` を足し、`validateList` は `AppError('invalidWritingLanguage')`。`saveListInPack` は `saved` を作るときに `writing` を一度取り除いてから、引数にあれば付ける。`errors.json` の6言語に文言を足す（ja：「手書き練習の言語が正しくありません。」）

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test` Expected: PASS（`i18n.test.cjs` を含む）

- [ ] **Step 5: コミット** — `git commit -m "リストに手書き練習の印 writing を足す（TS）"`

### Task 2: リストの印（Go）

**Files:**
- Modify: `server/internal/workspace/workspace.go`（`Writing` 型、`List.Writing`、`rawList.Writing`、`rawList.UnmarshalJSON` の知っている項目に `"writing"`、`decodeList`）
- Modify: `server/internal/workspace/encode.go`（`storedList.Writing`）
- Modify: `server/internal/workspace/lists.go`（`ListInput.Writing`）
- Modify: `server/internal/workspace/packfile.go`（`PackFileList.Writing`・`DecodePackFile`）
- Modify: `server/internal/api/api.go:51-71`（`/api/v1` のリストの応答に `writing`）
- Create: `tests/fixtures/pack-file/writing.json`（既存の `tests/fixtures/pack-file/README.md` の形）
- Test: `server/internal/workspace/workspace_test.go`・`lists_test.go`・`packfile_test.go`

**Interfaces:**
- Consumes: Task 1 の言語の一覧
- Produces:
  - `var WritingLanguages = []string{"en","ja","zh-Hans","zh-Hant","ko","fr","de","es","ru","cs"}`
  - `type Writing struct { Language string `json:"language"` }`、`List.Writing *Writing`、`storedList.Writing *Writing `json:"writing,omitempty"``
  - `ListInput.Writing *Writing`：`nil` は変えない、`Language == ""` は外す、それ以外は一覧にあれば付ける・なければ `&Error{Key: "invalidWritingLanguage"}`

- [ ] **Step 1: 失敗するテストを書く**
  - `TestDecodeKeepsWriting`：`"writing":{"language":"ja"}` の行を `Decode` → `Encode` して同じ JSON に戻る。`{"language":"xx"}` と `{"language":"ja","x":1}` は `Decode` がエラー（TS の `savedDataCorrupted` と同じ扱いの既存のエラー）
  - `TestListInputWriting`：`CreateList` に `Writing: &Writing{"ko"}` で付く、`UpdateList` に `&Writing{""}` で外れる、`nil` で変わらない、`"xx"` で `invalidWritingLanguage`
  - `TestPackFileWriting`：`tests/fixtures/pack-file/writing.json` を TS と同じく読み、`EncodePackFile` の出力が fixture のバイトと一致。`tests/packFile.test.cjs` にも同じ fixture を読むテストを足す

- [ ] **Step 2: 失敗を確かめる** — Run: `go test ./server/internal/workspace/ -run 'Writing'` Expected: FAIL（未定義）

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる** — Run: `gofmt -l .`（空）、`go vet ./...`、`go test ./...`、`npm test` Expected: PASS

- [ ] **Step 5: コミット** — `git commit -m "リストの印 writing を Go で読み書きする"`

### Task 3: 記録の mode（TS と Go）

**Files:**
- Modify: `src/core/records.ts`（`PracticeRecord.mode`・`makeRecord`・`addRecord`）、`src/core/wordLists.ts`（`records` の型と `decodeLists` の検証）
- Modify: `server/internal/workspace/workspace.go`（`Record.Mode`・`rawRecord.Mode`・知っている項目に `"mode"`・`decodeRecord` の検証）、`server/internal/workspace/records.go`（`RecordInput.Mode`・`AddRecord`。`RecordChange` には足さない）
- Create: `tests/fixtures/records/writing-mode.json`（追加される）、`tests/fixtures/records/writing-mode-refused.json`（`"mode":"typing"` で `invalidRecord`）。README の「守る約束」に1行足す
- Test: `tests/records.test.cjs`・`server/internal/workspace/records_test.go`（どちらも既存のループが fixtures を全部読む）

**Interfaces:**
- Produces:
  - `export type PracticeMode = 'typing' | 'writing'`
  - `PracticeRecord.mode?: 'writing'`、`makeRecord(session, wordCount, id, device?, mode?: 'writing'): PracticeRecord`
  - `export const recordMode = (record: { mode?: string }): PracticeMode => record.mode === 'writing' ? 'writing' : 'typing'`
  - Go：`Record.Mode string `json:"mode,omitempty"``、`RecordInput.Mode *string`、`func RecordMode(r *Record) string`（`"typing"`／`"writing"`）

- [ ] **Step 1: 失敗するテストを書く** — 2つの fixture。`records.test.cjs` に「makeRecord with writing mode」：`makeRecord(s, 2, 'w1', undefined, 'writing').mode === 'writing'`、`mode` を渡さなければキーがない。`decodeLists` は `mode: 'typing'` の保存済みの記録で `savedDataCorrupted`。Go に `TestUpdateRecordKeepsMode`：Writing の記録の `time` を変えても `Mode` が残る

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/records.test.cjs` と `go test ./server/internal/workspace/ -run Record` Expected: 新しい fixture で FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test`、`go test ./...` Expected: PASS

- [ ] **Step 5: コミット** — `git commit -m "記録に練習のモード mode を足す"`

### Task 4: 集計をタイピングと Writing で分ける（TS・Go・/api/v1）

**Files:**
- Modify（TS）：`src/core/rankings.ts`（`RankingOptions.mode`）、`src/core/dashboard.ts`（`summarize`・`nextLists`・`listTrends`）、`src/core/listOverview.ts`（`listOverviews`・`currentRecordCount`）、`src/core/records.ts`（`recordRows` の行に `mode`）
- Modify（Go）：`server/internal/workspace/rankings.go`（`ListRanking` に `mode string`）、`dashboard.go`（`Summarize`・`NextLists`・`ListTrends`）、`overview.go`（`Overviews`・`CurrentRecordCount`）、`server/internal/api/rankings.go`（`?mode=typing|writing`、既定 `typing`、ほかは `400 invalidQuery` など既存のクエリのエラーと同じ）
- Modify：`api-docs/` の記録・リスト・ベスト記録のページ（`mode`・`writing`・`?mode=`）
- Test: `tests/rankings.test.cjs`・`tests/dashboard.test.cjs`・`tests/listOverview.test.cjs`・`tests/records.test.cjs`、Go の `rankings_test.go`・`dashboard_test.go`・`overview_test.go`・`server/internal/api` の rankings のテスト

**Interfaces:**
- Consumes: Task 3 の `recordMode`／`RecordMode`
- Produces: `listRanking(list, { ..., mode?: PracticeMode })`（既定 `'typing'`）、Go `ListRanking(list, device, order, mode string, includeOthers bool, now)`。ダッシュボード・概要はタイピングの記録だけを使う（引数は変えない）。`recordRows` の各行に `mode: PracticeMode`

- [ ] **Step 1: 失敗するテストを書く** — どのテストも「タイピング2件＋Writing 1件（Writing の方が速く正確）」のリストで：`listRanking` の既定はタイピングの2件だけで best がタイピング、`mode: 'writing'` は1件。`summarize` の今週の回数は2、`nextLists` と `listTrends` も Writing を数えない、`listOverviews` の最後の練習日はタイピングのもの、`currentRecordCount` は2。`recordRows` は3行で Writing の行の `mode === 'writing'`。Go も同じ数字。API：`GET /api/v1/lists/{id}/ranking?mode=writing` が1件、`?mode=x` が 400

- [ ] **Step 2: 失敗を確かめる** — Run: `npm test`、`go test ./...` Expected: 新しいテストが FAIL

- [ ] **Step 3: 実装する** — 各関数の入口でタイピングの記録だけに絞る（呼び出し元は変えない）。`packRankings` は `listRanking` の結果を使うので変えない

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test`、`go test ./...`、`cd api-docs && npm run docs:build && npm run docs:check` Expected: PASS

- [ ] **Step 5: コミット** — `git commit -m "ベスト記録とダッシュボードでタイピングと Writing を分ける"`

### Task 5: 照合と Writing の進み方（`src/core/writing.ts`）

**Files:**
- Create: `src/core/writing.ts`
- Modify: `src/core/typing.ts`（`cyrillicAlternatives` を export）
- Create: `tests/fixtures/writing/README.md` と `tests/fixtures/writing/match.json`（`[{ "description", "candidates", "target", "language", "options", "expected" }]`）
- Test: `tests/writing.test.cjs`

**Interfaces:**
- Consumes: `TypingSession`・`newSession`・`resumeSession`（`typing.ts`）、`TypingOptions`、`WritingLanguage`
- Produces:
  - `normalizeWriting(text: string, language: WritingLanguage): string`
  - `matchesWriting(candidates: string[], target: string, language: WritingLanguage, options?: TypingOptions): boolean`
  - `startWriting(session: TypingSession, now: number): TypingSession` — 時計を動かす（`startedAt` がなければ `now`、止まっていれば再開）
  - `judgeWriting(session, words: { display: string }[], candidates: string[], now: number, language, options, explicit: boolean): TypingSession` — 一致：`attempts+1`、次の語へ（最後なら `finishedAt = now`）。不一致かつ `explicit` かつ候補に空でないものがある：`attempts+1`・`mistakes+1`・`missed: true`。それ以外は変えない
  - `skipWord(session, words, now): TypingSession` — `attempts+1`・`mistakes+1`、次の語へ（最後なら終わる）

- [ ] **Step 1: 失敗するテストを書く** — `match.json` に少なくとも次の例（`expected`）：
  - `["爱护"]` vs `爱护`（zh-Hans）→ true／`["爱 护"]` vs `爱护`（zh-Hans）→ true／`["I am  a student."]` vs `I am a student.`（en）→ true／`["Iam a student."]` vs 同（en）→ false
  - `["cafe"]` vs `café`（fr、`ignoreAccents` なし）→ false、あり → true／`["privet"]` vs `привет`（ru、`ignoreAccents`）→ true／`["Strasse"]` vs `Straße`（de、`ignoreAccents`）→ true／`["APPLE"]` vs `apple`（`ignoreCase`）→ true
  - `["かか", "がか"]` vs `がか`（ja）→ true（2つ目の候補）／`[]` → false／NFD の `"é"` vs NFC の `é` → true
  - `writing.test.cjs`：fixture のループ、`judgeWriting` の正解・最後の語で終わる・`explicit` の不一致でミス・黙った不一致で変わらない・**空の候補の Enter でミスにならない**、`skipWord`、2語で1ミスの `sessionResult(...).accuracy === 66.67`

- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/writing.test.cjs` Expected: FAIL（モジュールがない）

- [ ] **Step 3: 実装する** — 照合は両方を `normalizeWriting` してから、目標の文字ごとに候補を前から読む：

```ts
// p: position in the candidate. For each target character t:
//   matchesCharacter(c[p], t, options)                       -> p += 1
//   options.ignoreAccents && t is ß/ẞ && c[p..p+2] is "ss"   -> p += 2 (case as matchesCharacter)
//   options.ignoreAccents && a cyrillicAlternatives(t) value
//     equals c[p..p+a.length] (lower-cased when ignoreCase)  -> p += a.length
//   otherwise                                                -> no match
// A match needs p to reach the end of the candidate.
```

- [ ] **Step 4: 通ることを確かめる** — Run: `npm test` Expected: PASS

- [ ] **Step 5: コミット** — `git commit -m "手書きの照合と Writing の進み方を core に置く"`

### Task 6: リストの編集画面の印

**Files:**
- Modify: `src/components/WordListEditor.tsx`（`snapshot` に `writing`、切り替えと言語の選択、`onSave` に `writing`）
- Modify: `src/app/(workspace)/edit/page.tsx`・`create` の保存処理（`saveListInPack` に `writing` を渡す）
- Modify: `src/messages/*/wordLists.json`（`writingToggle`：「手書き練習（Typle Writing）に使う」、`writingLanguage`：「認識する言語」、`writingLanguages.<code>` の10言語名）
- Test: `tests/e2e/` の既存のリスト編集の spec に追加

**Interfaces:**
- Consumes: Task 1 の `WRITING_LANGUAGES`・`saveListInPack(list.writing)`
- Produces: 編集画面の `role="switch"`（名前 `writingToggle`）と `<select>`（名前 `writingLanguage`）

- [ ] **Step 1: 失敗する E2E を書く** — 「writing flag survives reload」：リストを作り、切り替えをオン、言語に `中文（简体）` を選んで保存→再読み込みして編集を開くとオンで `zh-Hans`。オフにして保存→再読み込みでオフ。オンにしたときの初期値は表示言語が日本語なら `ja`、対応がなければ `en`
- [ ] **Step 2: 失敗を確かめる** — Run: `npx playwright test -g "writing flag"` Expected: FAIL
- [ ] **Step 3: 実装する** — 切り替えを変えると `dirty` になる
- [ ] **Step 4: 通ることを確かめる** — Run: 同上、`npm run typecheck`、`npm run lint` Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "リストの編集画面に手書き練習の切り替えを足す"`

### Task 7: Web の Writing の練習画面

**Files:**
- Create: `src/lib/useWritingPractice.ts`（`usePractice` と同じ形の hook）、`src/components/Practice/WritingPractice.tsx`（見本・入力欄・「判定」「飛ばす」・「〇〇と読めました」）
- Modify: `src/app/(workspace)/play/page.tsx`（印付きのリストでだけ「タイピング／Writing」の切り替え。LocalStorage `typle-r:writing-mode` に `'typing'|'writing'` を try/catch で保存）
- Modify: `src/components/Practice/PracticeResult.tsx`（`mode === 'writing'` で「Writing」の表示）
- Modify: `src/app/(workspace)/rankings/page.tsx`・`src/components/Rankings/RankingDetail.tsx`（「タイピング／Writing」の切り替え → `listRanking({ mode })`）、`src/app/(workspace)/records/page.tsx`（`mode === 'writing'` の行に「Writing」の印）
- Modify: `src/messages/*/practice.json`・`rankings.json`・`records.json`（`modeTyping`：「タイピング」、`modeWriting`：「Writing」、`writingJudge`：「判定」、`writingSkip`：「飛ばす」、`writingRead`：「「{text}」と読めました」、`writingInput`：「ここに手書きで入力」）
- Test: `tests/e2e/writing.spec.ts`

**Interfaces:**
- Consumes: Task 5 の `startWriting`・`judgeWriting`・`skipWord`、Task 3 の `makeRecord(..., 'writing')`、Task 4 の `listRanking({ mode })`、`useTypingOptions`、`pauseSession`／`resumeSession`
- Produces: `useWritingPractice(list: SavedWordList, addRecord: RecordSave, device?: PracticeDevice)` が `{ session, word, finished, record, saveState, input, change(value), submit(), skip(), startComposition(), endComposition(value), pause(), resume(), restart(), retrySave() }` を返す

- [ ] **Step 1: 失敗する E2E を書く**（`tests/e2e/writing.spec.ts`。印付きの2語のリストを API で用意）
  - 「correct word advances」：Writing を選び、入力欄に1語目の `display` を入れると、入力欄が空になり2語目の見本が出る
  - 「wrong word counts a mistake on Enter」：違う文字で Enter → 「「…」と読めました」が出て入力は残る。正しく直すと進み、結果の正確率が 66.67%
  - 「empty Enter is not a mistake」と「skip counts a mistake」
  - 「composition is not judged」：`compositionstart` を送ってから `display` と同じ値を入れても進まず、Enter でもミスにならない。`compositionend` の後に進む
  - 「writing records are separate」：Writing を終えると記録の一覧に「Writing」の行、ベスト記録のタイピングには出ず、Writing の切り替えで出る
  - 「unflagged list hides the switch」：Writing を選んだまま印のないリストを選ぶと切り替えが消え、タイピングの画面になる
- [ ] **Step 2: 失敗を確かめる** — Run: `npx playwright test tests/e2e/writing.spec.ts` Expected: FAIL
- [ ] **Step 3: 実装する** — 入力欄は `lang={list.writing.language}`・`autoComplete="off"`・`autoCorrect="off"`・`autoCapitalize="off"`・`spellCheck={false}`。`change` は変換中でなければ `judgeWriting(..., [value], explicit=false)`、一致したら入力欄を空にする。`submit` は変換中なら何もしない。時計は最初の入力で `startWriting`。終わったら `makeRecord(session, words.length, randomId(), device, 'writing')` を保存（`usePractice` の保存の扱いをそのまま写す）。モードはリストを選んだとき・やり直したときに決め、練習中に別の端末で印が外れても、その回は最後まで続ける
- [ ] **Step 4: 通ることを確かめる** — Run: `npm run typecheck`、`npm test`、`npm run lint`、`npm run test:e2e` Expected: PASS。`preview_start` で `/play` を開き、スクリーンショットで見た目を確かめる
- [ ] **Step 5: コミット** — `git commit -m "Web に Writing の練習画面を足す"`

### Task 8: 文書・版・PR

**Files:**
- Modify: `docs/features.md`（「Typle Writing」の節：印・入力の手段の表・照合の規則・記録と集計の分け方・スマホは将来）、`src/components/Guide/`（使い方に Writing の説明と6言語の文言）
- Modify: `package.json`・`package-lock.json`（`npm version minor --no-git-tag-version` の前に `git tag` と GitHub Releases で番号を確かめる）

- [ ] **Step 1:** 文書と使い方を書く。`npm test`（`i18n.test.cjs`）が PASS
- [ ] **Step 2:** `README.md` の「検証」の全項目（`npm run typecheck`・`npm test`・`npm run lint`・`npm run build`・`npm run test:e2e`、`gofmt -l .`・`go vet ./...`・`go test ./...`、`api-docs` の `docs:build`・`docs:check`）を流し、すべて PASS
- [ ] **Step 3:** コミット `Typle Writing（手書きで単語を書いて覚えるモード）を Web に足す (v2.7.0)`、push、PR（タイトル同じ、説明は日本語。typle-ipad は本番公開の後に別の計画で行うことを書く）
