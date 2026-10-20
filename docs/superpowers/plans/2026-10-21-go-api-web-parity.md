# API（Go）を Web と同じ機能にする Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web アプリの機能（複製・CSV・端末の利用状況・リスト一覧・練習記録・ベスト記録・ダッシュボード）を Go の API に、アプリと同じ規則で加える。

**Architecture:** 規則と集計は `server/internal/workspace` の純粋関数（アプリの `src/core` の関数ごとに1つ）、HTTP は `server/internal/api`。1タスク = 1PR で、各タスクの最後にマージと本番公開の確認をしてから次のタスクを main から始める。

**Tech Stack:** Go 1.25、pgx v5.9.2、`golang.org/x/text`（PR 4 から直接の依存）、`time/tzdata`、PostgreSQL 16（テスト用）、Node（アプリの関数との突き合わせ）

**Spec:** `docs/superpowers/specs/2026-10-21-go-api-web-parity-design.md`

## Global Constraints

- 依存は標準ライブラリ・pgx・`golang.org/x/text` だけ（`x/text` は go.sum にある `v0.29.0` を使う）。
- 書き込み（Task 1・2 の取り込み）は `-writable` のときだけ。読み取りは読み取り専用でも使える。エラーは `{ "error": "<キー>" }`（取り込みは `line` も）。
- `tz` は IANA 名。省略時は `time.Local`。読めなければ `400 invalidQuery`。`time/tzdata` を `cmd/typle-api` で埋め込む。
- 記録の日時の比較は `Record.At`。並べ替えは `slices.SortStableFunc`。
- 記録を返すときは保存されている形（知らない項目も含む）に項目を足す。
- 日本語に左右される部分は日本語: 複製の印 `（コピー）`・`（コピー{n}）`（n ≥ 2）。
- バージョン: Task 1 = 0.46.0、以後 1 つずつ上げて Task 7 = 0.52.0（main が先に進んでいたら次の空き番号）。
- 各タスクの終わりに `gofmt -l .`（空）・`go vet ./...`・`TYPLE_TEST_DATABASE_URL=… go test ./...`・`npm test`（DB あり）・`npm run lint`・`npm run typecheck` を通す。
- `docs/release-workflow.md` の順序を守る。前の main の Release と deploy が終わるまで次の PR をマージしない。

## Review Focus

- `tz` に `Asia/Tokyo` と `UTC` を渡したときに、JST の 0〜9時の記録の `day`・今週・連続日数が変わる（Task 5・7 でテスト）。
- 名前に数字を含むリスト（`List 2`・`List 10`）の名前順: 一覧（Task 4）は `2 < 10`、ベスト記録（Task 6）は `10 < 2`（Task 4・6 でテスト）。
- CSV の取り込みで、引用符の中の改行を含むファイルの行番号が、エラーの `line` に正しく出る（Task 2 でテスト）。
- 複製の印を足すと名前が200文字を超える場合、元の名前を切り詰めて200文字ちょうどになる（Task 1 でテスト）。
- 記録が0件のアカウントでも、ダッシュボード・ベスト記録・練習記録が 200 で空の値を返す（Task 5・6・7 でテスト）。

## Setup（各タスクの前に）

```bash
cd /home/user/typle-r && git fetch -q origin main && git checkout -q -B <branch> origin/main
su postgres -c '/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/claude-pg -o "-p 5433 -k /tmp" -l /tmp/claude-pg/log start'
export TYPLE_TEST_DATABASE_URL=postgresql://typle@127.0.0.1:5433/typle DATABASE_URL=postgresql://typle@127.0.0.1:5433/typle
npm run db:migrate && (cd server && go test ./...)
```

Expected: 既存のテストがすべて PASS。

## 各タスクの終わり（Ship）

1. `docs/api.md` を更新し、`npm version <X.Y.Z> --no-git-tag-version`。
2. 上の確認をすべて通してコミットし、push してドラフト PR を作り、`subscribe_pr_activity`。
3. CI が通り、前の main の Release と deploy が終わっていたら、下書きを外して squash merge。
4. マージ後の main の CI（policy → verify → release → deploy）が成功し、`vX.Y.Z` の Release があることを確かめる。

---

### Task 1: リストの複製（`feat/go-api-copy`、v0.46.0）

**Files:**
- Create: `server/internal/workspace/copy.go`、`server/internal/workspace/copy_test.go`
- Modify: `server/internal/api/api.go`（ルート）、`server/internal/api/write.go`（ハンドラー）、`server/internal/api/write_test.go`、`server/internal/store/store_test.go`、`docs/api.md`

**Interfaces:**
- Produces: `func CopyList(w *Workspace, sourceID string, name *string, id string, now time.Time) (*List, error)`、`func copyName(w *Workspace, name string) string`
- Consumes: 既存の `checkName`・`lowerCase`・`length`・`FormatTime`・`MaxLists`・`MaxListName`

- [ ] **Step 1: Write the failing tests**（`copy_test.go`。`tests/listOverview.test.cjs` の「a copy gets a free name…」を移す）

```go
func TestCopyList(t *testing.T)          // l1（記録1件、単語の Extra あり、リストの Extra あり）を複製 → 末尾、Name "英単語（コピー）"、Words は同じ値で Extra も同じ、Records は空で非 nil、List.Extra は ""、CreatedAt FormatTime(now)、元のリストは変わらない
func TestCopyNameSkipsTaken(t *testing.T) // "英単語（コピー）" があると "英単語（コピー2）"、それもあると "英単語（コピー3）"。大文字違い "ABC（コピー）" も使用中とみなす
func TestCopyNameFitsLimit(t *testing.T)  // 名前が200文字（"a"×200）→ "a"×195 + "（コピー）"（合計200、UTF-16 で数える）。前後の空白は除いてから
func TestCopyListWithName(t *testing.T)   // name="動物" → その名前。name="Fruits"（既存と重複）→ listNameDuplicate
func TestCopyListErrors(t *testing.T)     // 未知の id → listNotFound、リストが MaxLists 件 → listLimit。どちらも w.Lists が変わらない
```

- [ ] **Step 2: Run** `cd server && go test ./internal/workspace/ -run Copy` — Expected: FAIL（未定義）
- [ ] **Step 3: Implement** `copy.go`。`copyName` はアプリの `copyName` と同じ: n=1 の印は `（コピー）`、n≥2 は `（コピー{n}）`。候補 = 元の名前（前後の空白を除く）を `MaxListName - length(印)` の UTF-16 単位まで先頭から切ったもの + 印。`lowerCase` で既存の名前（前後の空白を除く）と比べ、空いている最初の n。サロゲートペアの途中で切らない（切る位置がペアの後半なら1つ手前で切る）。
- [ ] **Step 4: Write the failing HTTP tests**（`write_test.go`）

```go
func TestCopyList(t *testing.T) // POST /api/v1/lists/l1/copy（本文なし・Content-Type なし）→ 201、name "英単語（コピー）"、recordCount 0、wordCount 2、id が UUID
                                 // POST … `{"name":"x"}`（application/json）→ 201 name "x"；本文あり text/plain → 415；未知のリスト → 404 listNotFound；writer なし → 405 Allow "GET, HEAD"
```
`TestAllowHeaders` に `/api/v1/lists/l1/copy` を足す: `-writable` では `GET` → 405 で `Allow: POST`。読み取り専用では `POST` → 405 で `Allow` は空（このパスで使えるメソッドがない）。

- [ ] **Step 5: Implement** ルート `/api/v1/lists/{listId}/copy` を `s.route(nil, write{POST, s.copyList})`。`route` は `read == nil` のとき GET・HEAD を許すメソッドに入れず、`Allow` には許すメソッドだけを並べる（なければ空）。本文が空（`r.ContentLength == 0` かつ `Transfer-Encoding` なし）なら `name` なし、あれば `decode[struct{ Name *string \`json:"name"\` }]`。
- [ ] **Step 6: DB test** `TestModifyCopiesList`（store_test.go）: 記録と Extra のあるリストを複製して保存 → 行の `lists` にコピーがあり記録が空、元はそのまま。
- [ ] **Step 7: Run** `go test ./...` — Expected: PASS
- [ ] **Step 8: Ship** v0.46.0（設計書とこの計画もこの PR に含める）

---

### Task 2: CSV・TSV の取り込みと書き出し（`feat/go-api-csv`、v0.47.0）

**Files:**
- Create: `server/internal/workspace/delimited.go`、`server/internal/workspace/delimited_test.go`
- Modify: `server/internal/workspace/encode.go`（`Error` に `Line int`）、`server/internal/api/api.go`、`server/internal/api/write.go`（`failure` に line を出せるよう）、`server/internal/api/write_test.go`、`docs/api.md`

**Interfaces:**
- Produces: `type Error struct{ Key string; Line int }`（`Line` は0なら出さない）、`func ParseWordFile(source string, delimiter rune) ([]Word, error)`、`func EncodeWordCSV(words []Word) string`、`func WordFilename(name, extension string) string`、`const MaxImportBytes = 1 << 20`
- Consumes: Task 1 までの API、`CreateList`

- [ ] **Step 1: Write the failing tests**（`delimited_test.go`。`tests/importWords.test.cjs`・`tests/exportWords.test.cjs` の全テストの入力と期待値を移す）

```go
func TestParseCSV(t *testing.T)            // BOM・CRLF・見出しの並べ替え・"" の引用符・引用符内の改行を含む annotation
func TestParseTSV(t *testing.T)            // annotation なし・空行
func TestParseErrors(t *testing.T)         // 各キーと line: 閉じない引用符 → importQuote line 2；見出しなし → importHeaderRequired；重複 → importHeaderDuplicate；未知 → importHeaderUnknown；行なし → importNoRows；1001 行 → importTooManyRows；列数違い → importColumnCount line 3；空の input → importFieldRequired；1001 文字 → importFieldTooLong
func TestParseLineNumbersAfterQuotedNewline(t *testing.T) // 2行目の引用符内に改行2つ → その後の行の列数エラーが line 5（Review Focus）
func TestParseKeepsWhitespaceAndDuplicates(t *testing.T)
func TestEncodeCSVRoundTrip(t *testing.T)  // Unicode・前後の空白・重複・引用符・改行 → ParseWordFile(EncodeWordCSV(w), ',') == w；先頭 "﻿input,display,annotation\r\n"、末尾 "\r\n"
func TestWordFilename(t *testing.T)        // exportWords.test.cjs の期待値（例: `a/b:c` → `a_b_c.csv`、`CON` → `_CON.csv`、空 → `word-list.csv`、80文字で切る）
```

- [ ] **Step 2: Run** `go test ./internal/workspace/ -run 'Parse|Encode|Filename'` — Expected: FAIL
- [ ] **Step 3: Implement** `delimited.go` をアプリの `parseWordFile`・`encodeWordCsv`・`wordFilename` の行ごとの写しとして（UTF-16 の長さは `length`、上限は1000行・`MaxWordText`・`MaxAnnotation`、1MiB を超えたら `importTooLarge`）。
- [ ] **Step 4: Node と突き合わせ**（コミットしない）: 50 個の CSV（ランダムな引用符・改行・BOM・列数）を Node の `parseWordFile` と Go の `ParseWordFile` に通し、結果かエラーのキーと line が一致することを確かめる。
- [ ] **Step 5: Write the failing HTTP tests**

```go
func TestImportList(t *testing.T)   // POST /api/v1/lists/import?name=動物&format=csv（text/csv）→ 201、words が CSV のとおり；format=tsv と text/tab-separated-values も；text/plain も可
func TestImportErrors(t *testing.T) // name なし → 400 listNameRequired；format=xls → 400 invalidQuery；application/json → 415；1MiB+1 → 413 importTooLarge；引用符エラー → 400 {"error":"importQuote","line":2}；writer なし → 405
func TestExportCSV(t *testing.T)    // GET /api/v1/lists/l1/words.csv → 200、Content-Type "text/csv; charset=utf-8"、本文 = EncodeWordCSV、Content-Disposition に filename*=UTF-8''%E8%8B%B1%E5%8D%98%E8%AA%9E.csv と filename="___.csv"；HEAD も 200；未知 → 404 listNotFound（JSON）
```

- [ ] **Step 6: Implement** ルート `/api/v1/lists/import`（`s.route(nil, write{POST, s.importList})`）と `/api/v1/lists/{listId}/words.csv`（読み取り）。`failure` は `*workspace.Error` の `Line` が0でなければ `"line"` を足す。`/api/v1/lists/import` が `/api/v1/lists/{listId}` より優先されることを確かめる（Go の ServeMux は具体的なパスを優先する）。
- [ ] **Step 7: Run** `go test ./...` — Expected: PASS
- [ ] **Step 8: Ship** v0.47.0

---

### Task 3: 端末の利用状況（`feat/go-api-device-usage`、v0.48.0）

**Files:**
- Create: `server/internal/workspace/usage.go`、`server/internal/workspace/usage_test.go`
- Modify: `server/internal/api/api.go`（`devices`・`device`）、`server/internal/api/api_test.go`、`server/internal/api/write_test.go`、`docs/api.md`

**Interfaces:**
- Produces: `type Usage struct{ PracticeCount int \`json:"practiceCount"\`; LastPracticed *string \`json:"lastPracticed"\` }`、`func DeviceUsage(lists []List) map[string]Usage`（`LastPracticed` は最も新しい `At` の記録の `Date`）

- [ ] **Step 1: Write the failing tests**（`tests/devices.test.cjs` の「device usage counts records by device id, including renamed snapshots」を移す）

```go
func TestDeviceUsage(t *testing.T) // 名前の違うスナップショットも id で合算；lastPracticed は最も新しい記録の date の文字列そのまま；端末なしの記録は数えない
```
`TestDevices`（api_test.go）の期待値を `{"devices":[{"id":"d1",…,"practiceCount":1,"lastPracticed":"2026-10-03T00:00:00.000Z"}],"default":{"practiceCount":0,"lastPracticed":null}}` に、`TestDevice` も同様に更新。

- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement** `usage.go` と API の応答（端末の JSON に2項目を足した形。`Device` の型は変えず、API 側で別の構造体に詰める）。
- [ ] **Step 4: Run** `go test ./...` — Expected: PASS
- [ ] **Step 5: Ship** v0.48.0

---

### Task 4: リスト一覧の並べ替え・検索（`feat/go-api-list-overview`、v0.49.0）

**Files:**
- Create: `server/internal/workspace/overview.go`、`server/internal/workspace/overview_test.go`、`server/internal/workspace/collate.go`
- Modify: `server/go.mod`・`server/go.sum`（`golang.org/x/text` を直接の依存に）、`server/internal/api/api.go`（`lists`・`summary`）、`server/internal/api/api_test.go`、`docs/api.md`

**Interfaces:**
- Produces:
  - `func CompareNames(a, b string, numeric bool) int`（`collate.New(language.Japanese)`、numeric なら `collate.Numeric`。collator はゴルーチン安全でないので呼び出しごとに作るか `sync.Pool`）
  - `type Overview struct{ List *List; Position, PracticeCount int; LastPracticed *time.Time }`
  - `func Overviews(lists []List) []Overview`、`func SortOverviews(items []Overview, order string) ([]Overview, bool)`（order 不明なら false）、`func MatchesQuery(list *List, query string) bool`、`func CurrentRecordCount(list *List) int`
- 一覧の各リストの JSON に `practiceCount`・`lastPracticed`（`FormatTime` の形か null）・`currentRecordCount` を足す（詳細の `GET /lists/{l}` にも）。

- [ ] **Step 1: Write the failing tests**（`tests/listOverview.test.cjs` の overviews・orders・search・current word count を移す）

```go
func TestOverviews(t *testing.T)          // 練習回数と最も新しい日時
func TestSortOverviews(t *testing.T)      // added=新しい順；practiced=新しい順で未練習は後ろ；name=自然順（"List 2" < "List 10"、Review Focus）；words=多い順；同点は新しく追加した順；不明な order → false
func TestMatchesQuery(t *testing.T)       // 名前・display・input、大文字小文字を無視、空は全部
func TestCurrentRecordCount(t *testing.T)
```
API: `TestListsSortAndSearch`（`?sort=name`・`?q=apple`・`?sort=bad` → 400 invalidQuery）、`TestLists` の期待値に3項目を足す。

- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**（`go get golang.org/x/text@v0.29.0` で直接の依存に。`go mod tidy`）
- [ ] **Step 4: Node と突き合わせ**（コミットしない）: ランダムな名前（かな・漢字・英数字・数字入り）200個を `Intl.Collator('ja',{numeric:true})` と `CompareNames(…, true)` で並べ、順序が一致することを確かめる。違いがあれば PR 本文に書き、spec の「近い順序」として記録する。
- [ ] **Step 5: Run** `go test ./...` — Expected: PASS
- [ ] **Step 6: Ship** v0.49.0

---

### Task 5: 練習記録（`feat/go-api-records-feed`、v0.50.0）

**Files:**
- Create: `server/internal/workspace/rank.go`、`server/internal/workspace/rank_test.go`、`server/internal/workspace/feed.go`、`server/internal/workspace/feed_test.go`、`server/internal/api/query.go`（`tz`・`limit`・`since` の読み込み）、`server/internal/api/fields.go`（記録に項目を足す）
- Modify: `server/internal/api/api.go`（ルートと既存の records の `limit`・`since` を query.go に移す）、`server/cmd/typle-api/main.go`（`import _ "time/tzdata"`）、テスト、`docs/api.md`

**Interfaces:**
- Produces:
  - `func RankRecords(records []Record, order string) []Record`（`accuracy`／`speed`。`rankRecords` と同じ比較。正確率なしは -1 として扱う）
  - `func ComparableRecords(list *List, records []Record) []Record`、`func ListBest(list *List) *Record`（ポインターは `list.Records` の要素を指す）
  - `type FeedRow struct{ List *List; Record *Record; Best bool }`、`func Feed(lists []List, listID, device string) []FeedRow`（新しい順・安定。`device` は id か `none`、空は全部）
  - API: `func location(query url.Values) (*time.Location, bool)`、`func withFields(record workspace.Record, fields map[string]any) (json.RawMessage, error)`
- 応答: `{ "records": [ …記録 + listId, listName, best, day ] }`

- [ ] **Step 1: Write the failing tests**（`tests/records.test.cjs` の「record rows are newest first and mark the current best」「filters match lists and devices by id」「rows are grouped by local day」、`tests/rankings.test.cjs` の「accuracy-first ranks…」「only runs at the current word count…」を移す）

```go
func TestRankRecords(t *testing.T)
func TestListBest(t *testing.T)
func TestFeed(t *testing.T)        // 新しい順、best、list・device・none の絞り込み
func TestFeedDay(t *testing.T)     // API: 2026-10-10T20:00:00Z の記録は tz=Asia/Tokyo で day "2026-10-11"、tz=UTC で "2026-10-10"（Review Focus）
```
API: `TestRecordsFeed`（`?list=`・`?device=none`・`?limit=1`・`?since=`・`?tz=Mars/Base` → 400 invalidQuery、記録なしのアカウント → 200 `{"records":[]}`（Review Focus））。

- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**（`withFields` は記録の JSON の末尾の `}` の前に、キーの順に `,"listId":…` を足す）
- [ ] **Step 4: Node と突き合わせ**（コミットしない）: ランダムな記録 300 件の workspace で `recordRows` と Go の `Feed` の順序と best が一致する。
- [ ] **Step 5: Run** `go test ./...` — Expected: PASS
- [ ] **Step 6: Ship** v0.50.0

---

### Task 6: ベスト記録（`feat/go-api-rankings`、v0.51.0）

**Files:**
- Create: `server/internal/workspace/rankings.go`、`server/internal/workspace/rankings_test.go`、`server/internal/api/rankings.go`
- Modify: `server/internal/api/api.go`（ルート）、テスト、`docs/api.md`

**Interfaces:**
- Consumes: Task 5 の `RankRecords`・`ComparableRecords`、Task 4 の `CompareNames`、Task 5 の `withFields`
- Produces:
  - `type Ranking struct{ List *List; Records, Ranked, Others []Record; OtherCounts []WordCountGroup; Fallback bool; Best *Record; LastPracticed *time.Time; Improved bool }`、`type WordCountGroup struct{ WordCount *int \`json:"wordCount"\`; Count int \`json:"count"\` }`
  - `func ListRanking(list *List, device, order string, includeOthers bool, now time.Time) Ranking`
  - `func SortRankings(rankings []Ranking, sort string) ([]Ranking, bool)`（`recent`・`name`（`CompareNames(…, false)`）・`count`）
  - `type RankingStats struct{ RecentCount int; RecentTime, RecentAccuracy *float64; Points []Point }`、`type Point struct{ Date string \`json:"date"\`; Value float64 \`json:"value"\` }`、`func Stats(ranked []Record) RankingStats`

- [ ] **Step 1: Write the failing tests**（`tests/rankings.test.cjs` の残りの全テストを移す: separates other word counts、device filter と fallback、「更新」、sort、stats）

```go
func TestSortRankingsByName(t *testing.T) // "List 10" < "List 2"（数字は文字として、Review Focus）
```
API: `TestRankings`（一覧の形・`?order=speed`・`?sort=bad` → 400）、`TestRanking`（詳細の形・`includeOthers=true`・未知 → 404 listNotFound・記録なしのリスト → 200 で `ranked: []`、`best: null`）。

- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Node と突き合わせ**（コミットしない）: ランダムな workspace で `listRanking`・`sortRankings`・`rankingStats` と Go の結果（順位・best・improved・stats）が一致する。
- [ ] **Step 5: Run** `go test ./...` — Expected: PASS
- [ ] **Step 6: Ship** v0.51.0

---

### Task 7: ダッシュボード（`feat/go-api-dashboard`、v0.52.0）

**Files:**
- Create: `server/internal/workspace/dashboard.go`、`server/internal/workspace/dashboard_test.go`、`server/internal/api/dashboard.go`
- Modify: `server/internal/api/api.go`（ルート）、テスト、`docs/api.md`、`README.md`（Go API の段落に「Web と同じ機能」）

**Interfaces:**
- Consumes: Task 5 の `ListBest`・`location`・`withFields`
- Produces: `func Summarize(lists []List, now time.Time) Summary`、`func NextLists(lists []List, now time.Time, limit int) []NextList`、`func ListTrends(lists []List) []ListTrend`（`now` は `tz` の Location を持つ時刻。日の区切りは `now.Location()`）。JSON の形は spec の PR 7 のとおり。

- [ ] **Step 1: Write the failing tests**（`tests/dashboard.test.cjs` の「weeks start on local Monday…」から「trends keep the latest twenty points…」までを移す。目盛りと表示用の2テストは移さない）

```go
func TestSummaryDependsOnTZ(t *testing.T) // JST 月曜 08:00（UTC 日曜 23:00）の記録: Asia/Tokyo では今週、UTC では先週（Review Focus）
```
API: `TestDashboard`（形・`?tz=`・記録なし → 200 で `weekCount: 0`、`accuracy: null`、`next` は新しいリスト、`trends: []`（Review Focus））。

- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**（`startOfDay` は `time.Date(y, m, d, 0, 0, 0, 0, loc)`、`addDays` は `AddDate(0, 0, n)`。アプリと同じく夏時間の日も日付で数える）
- [ ] **Step 4: Node と突き合わせ**（コミットしない）: `TZ=Asia/Tokyo` と `TZ=America/New_York` の Node で `summarize`・`nextLists`・`listTrends` を計算し、同じ `tz` の Go と一致する。
- [ ] **Step 5: Run** `go test ./...` — Expected: PASS
- [ ] **Step 6: Ship** v0.52.0。最後に whole-branch ではなく7つの PR 全体の最終レビュー（`git diff 6c62989..main -- server docs/api.md`）を別のレビュアーで行い、重大な指摘は修正 PR（v0.52.1）で直す。
