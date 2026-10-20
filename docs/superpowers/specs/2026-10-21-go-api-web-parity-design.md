# API（Go）を Web と同じ機能にする 設計

- 日付: 2026-10-21
- 対象バージョン: v0.46.0 〜 v0.52.0（7つの PR）
- 前提: v0.45.0 の API（`docs/api.md`）。リスト・端末の作成・変更・削除、記録の追加・変更・削除はすでにある

## 目的

Web アプリでできることのうち、API にする意味があるものをすべて Go の API でもできるようにする。規則と結果は Web アプリ（`src/core`・`src/plugins/formats`）と同じにする。

## 範囲外

画面やブラウザーだけのもの。タイピング練習そのもの（入力の判定は画面。結果は `POST …/records` で送れる）、表示言語・テーマ、使い方・Typle について、ログイン画面、ブラウザー保存のデータと旧データの取り込み、グラフの目盛りや「1分20秒」のような表示用の整形（`speedScale`・`accuracyScale`・`durationParts`・`recordTimeParts`・`formatAccuracy`）。

## 共通

- 書き込み（PR 1・2 の取り込み）は `-writable` のときだけ。読み取りは読み取り専用でも使える。認証・エラーの形・判定の順序はこれまでと同じ。
- **日付の区切り**: アプリは見ている人の地域の時刻で区切る（`src/core/dashboard.ts` の `startOfDay` など）。API では `tz`（IANA 名。例 `Asia/Tokyo`）で指定する。省略するとサーバーのタイムゾーン（`TZ`）。読めない名前は `400 invalidQuery`。タイムゾーンのデータは `time/tzdata` を埋め込み、サーバーの OS に依存しない。
- **言語**: アプリの文言に左右される部分は、基準の言語（日本語）に合わせる。
- **日時の比較**: 記録の日時は `workspace.ParseTime` で読んだ時刻（`At`）で比べる。アプリの `Date.parse` と同じ読み方。
- **並べ替えの安定性**: アプリの `Array.prototype.sort` は安定なので、Go でも `slices.SortStableFunc` を使う。
- **名前の並べ替え**: アプリの `Intl.Collator('ja', { numeric: true })`（PR 4）・`localeCompare(…, 'ja')`（PR 6）に合わせて `golang.org/x/text/collate`（日本語。PR 4 だけ `collate.Numeric`）を使う。`golang.org/x/text` は pgx がすでに使っている Go 公式のライブラリで、直接の依存に上げる。
- **記録に付ける項目**: 記録を返すときは保存されている形のまま（知らない項目も含む）で、そこに `listId` などの項目を足す。
- 各 PR で `docs/api.md` を更新し、バージョンを1つ上げる（0.46.0 から）。前の PR の本番公開を確かめてから次の PR をマージする。

## PR 1: リストの複製（v0.46.0）

`POST /api/v1/lists/{l}/copy`（`-writable`）。本文は省略できる。送るなら `{ "name"? }`。

- `duplicateList`（`src/core/listOverview.ts`）と同じ。単語をコピーし、記録はコピーしない。ID は UUID、`createdAt` は今。最後に追加する。知らない項目は単語のものだけコピーし、リストのものはコピーしない（アプリの `duplicateList` は `{ ...word }` で単語の項目をすべてコピーし、リストは決まった項目だけで作る）。
- 名前を省略すると `copyName` と同じ規則で「元の名前（コピー）」、それが使われていれば「（コピー2）」「（コピー3）」…。元の名前は前後の空白を除き、印を足して200文字を超えないよう先頭から切る。比べ方はリスト名の重複判定と同じ。
- 名前を送るとその名前にする（リスト作成と同じ検証）。
- リストが100件あれば `400 listLimit`、元のリストがなければ `404 listNotFound`。
- 応答は `201 { "list" }`（`GET /api/v1/lists/{l}` と同じ形）。
- 本文が空なら `Content-Type` は問わない。本文があるときはほかの書き込みと同じく `application/json`。

## PR 2: CSV・TSV の取り込みと書き出し（v0.47.0）

### 取り込み: `POST /api/v1/lists/import?name=…&format=csv|tsv`（`-writable`）

- 本文はファイルの中身そのもの（UTF-8）。`Content-Type` は `text/csv`・`text/tab-separated-values`・`text/plain` のいずれか（`;` より前を見る）。違えば `415 unsupportedContentType`。
- `format` は必須（`csv` か `tsv`）。`name` は必須で、リスト作成と同じ検証（`listNameRequired`・`listNameDuplicate`・`invalidList`・`listLimit`）。不正な `format` は `400 invalidQuery`。
- 読み方は `parseWordFile`（`src/plugins/formats/delimited.ts`）と同じ。BOM を捨てる、`"` で囲んだ項目（`""` は `"`、改行を含められる）、空行を捨てる、1行目が見出し（`input`・`display` が必須、`annotation` は任意、誤記の `anotation` は `annotation`）。
- エラーは `400` で、アプリと同じキー。行番号があるものは `line` を付ける: `{ "error": "importQuote", "line": 3 }`。
  - `importQuote`（line）、`importHeaderRequired`、`importHeaderDuplicate`、`importHeaderUnknown`、`importNoRows`、`importTooManyRows`（1000行超）、`importColumnCount`（line）、`importFieldRequired`（line）、`importFieldTooLong`（line）。
  - 1MiB を超える本文は `413 importTooLarge`（アプリの `MAX_IMPORT_BYTES`）。
  - NUL 文字はリスト作成と同じく `invalidList`。
- 単語の前後の空白・改行・順序・重複はそのまま保存する（アプリと同じ）。
- 応答は `201 { "list" }`。

### 書き出し: `GET /api/v1/lists/{l}/words.csv`

- `encodeWordCsv` と同じ。BOM、見出し `input,display,annotation`、すべての項目を `"` で囲む、改行は CRLF、最後にも CRLF。
- `Content-Type: text/csv; charset=utf-8`。`Content-Disposition: attachment; filename*=UTF-8''<名前>`。名前は `wordFilename` と同じ規則（使えない文字を `_` に、前後の `.` と空白を除く、80文字まで、Windows の予約名の前に `_`、空なら `word-list`）で、拡張子は `.csv`。ASCII だけの `filename="…"` も付ける（ASCII 以外は `_`）。
- `HEAD` も使える。リストがなければ `404 listNotFound`（JSON）。

## PR 3: 端末の利用状況（v0.48.0）

`GET /api/v1/devices` の応答に項目を足す（今の項目はそのまま）。

```json
{
  "devices": [{ "id": "d1", "name": "自宅", "layout": "JIS", "practiceCount": 12, "lastPracticed": "2026-10-20T02:00:00.000Z" }],
  "default": { "practiceCount": 3, "lastPracticed": "2026-10-19T09:00:00.000Z" }
}
```

- `deviceUsage`（`src/core/devices.ts`）と同じ。すべてのリストの記録を、記録に入っている端末の `id` で数える（名前を変えた後も引き継がれる）。`lastPracticed` は最も新しい記録の `date`（保存されている形のまま）。記録がなければ `practiceCount: 0`・`lastPracticed: null`。
- `default` は組み込みの「デフォルト」（`id` が `default`）の分。
- `GET /api/v1/devices/{d}` の `device` にも同じ2項目を足す。

## PR 4: リスト一覧の並べ替え・検索（v0.49.0）

`GET /api/v1/lists?sort=added|practiced|name|words&q=…`

- 各リストに `practiceCount`（記録の数。`recordCount` と同じ値で、アプリの名前に合わせた別名）、`lastPracticed`（最も新しい記録の日時を `toISOString` の形で。なければ `null`）、`currentRecordCount`（今の単語数と同じ単語数の記録の数）を足す。
- `sort` を省略すると今と同じ保存順（古い順）。指定すると `sortOverviews` と同じ:
  - `added`: 新しい順（保存順の逆）
  - `practiced`: 最後に練習した日の新しい順。練習していないリストは後ろ。同じなら新しく追加した順
  - `name`: 名前順（日本語の照合、数字は数として）。同じなら新しく追加した順
  - `words`: 単語の多い順。同じなら新しく追加した順
- `q` は `matchesQuery` と同じ。前後の空白を除いて小文字にし、名前か、いずれかの単語の `display`・`input` に含まれるリストだけ。空なら全部。
- 不正な `sort` は `400 invalidQuery`。

## PR 5: 練習記録（v0.50.0）

`GET /api/v1/records?list=&device=&since=&limit=&tz=`

- すべてのリストの記録を新しい順（`recentRecords` と同じ。同じ日時はリストの順・保存順）。
- 各記録に足す項目: `listId`、`listName`、`best`（そのリストの今のベスト `listBest` かどうか）、`day`（`tz` での日付 `YYYY-MM-DD`。アプリの「日ごとのまとめ」の区切り）。
- 絞り込みは `filterRows` と同じ: `list` はリストの ID、`device` は端末の ID か `none`（端末のない記録）。`since`・`limit` は `GET …/lists/{l}/records` と同じ（`limit` は1〜1000、既定100）。
- 知らないリストの ID は空の結果（アプリの絞り込みと同じ）。不正な値は `400 invalidQuery`。

## PR 6: ベスト記録（v0.51.0）

### 一覧: `GET /api/v1/rankings?device=&order=accuracy|speed&sort=recent|name|count`

```json
{ "rankings": [{ "listId": "l1", "listName": "英単語", "wordCount": 20, "recordCount": 8, "best": { …記録… }, "lastPracticed": "…", "improved": true }] }
```

- `listRanking`・`sortRankings`（`src/core/rankings.ts`）と同じ。`recordCount` は選んだ端末での記録の数、`best` はその順位1位（なければ `null`）、`improved` は「ベストが7日以内に出て、それより前の記録がある」。
- `order` の既定は `accuracy`（正確率を優先、同じなら速い順）。`speed` は速い順、同じなら正確率の高い順。
- `sort` の既定は `recent`（最後に練習した順）。`name` は名前順（日本語の照合。アプリの `localeCompare(…, 'ja')` と同じく、PR 4 と違って数字は文字として比べる）、`count` は記録の多い順。同じ順位はリストの保存順。
- 記録のないリストも含む（アプリと同じ）。

### 詳細: `GET /api/v1/rankings/{l}?device=&order=&includeOthers=true|false`

```json
{
  "ranking": {
    "listId": "l1", "listName": "英単語", "wordCount": 20,
    "ranked": [ …順位順の記録… ], "best": { … }, "fallback": false,
    "otherCounts": [{ "wordCount": 18, "count": 2 }, { "wordCount": null, "count": 1 }],
    "lastPracticed": "…", "improved": false,
    "stats": { "recentCount": 5, "recentTime": 41.2, "recentAccuracy": 97.4, "points": [{ "date": "…", "value": 40.1 }] }
  }
}
```

- `ranked` はすべて返す（アプリは上位5件を表示し、「すべて表示」で残りを出す）。`includeOthers` は今と違う単語数の記録も順位に入れる。`fallback` は今の単語数の記録が1件もないとき。
- `stats` は `rankingStats` と同じ（直近5回の平均時間・平均正確率、直近20回の時間の推移）。

## PR 7: ダッシュボード（v0.52.0）

`GET /api/v1/dashboard?tz=`

- `summarize`・`nextLists`・`listTrends`（`src/core/dashboard.ts`）と同じ。週は月曜はじまり、日の区切りは `tz`。
- `summary`: `weekStart`（今週の月曜0時を `toISOString` の形で）、`weekCount`、`previousWeekCount`（先週の同じ曜日・時刻まで）、`weekSeconds`、`previousWeekSeconds`、`streak`、`practicedToday`、`accuracy`（直近10回の平均と、その前の10回との比較。記録がなければ `null`）。
- `next`: 最大3件。`{ "listId", "listName", "lastPracticed", "reason": { "kind": "new" } | { "kind": "stale", "days": 4 } | { "kind": "accuracy", "accuracy": 85.5, "count": 5 } }`。
- `trends`: 記録のあるリストを最後に練習した順に。`{ "listId", "listName", "count", "lastPracticed", "speed": { "points", "change" }, "accuracy": { "points", "change" }, "best" }`。`speed` は1単語あたりの秒数。
- 記録が1件もなくても、空の値で返す（アプリは案内を表示するだけ）。

## テスト

- 各 PR で、アプリの TypeScript のテスト（`tests/listOverview.test.cjs`・`importWords.test.cjs`・`exportWords.test.cjs`・`devices.test.cjs`・`records.test.cjs`・`rankings.test.cjs`・`dashboard.test.cjs`）にある入力と期待値を Go のテストに移す。
- 集計（PR 4〜7）と CSV（PR 2）は、同じ入力から Node でアプリの関数が出した結果と、Go の結果を突き合わせるテスト用の比較も1回行う（CI には入れない。比べた結果を PR に書く）。
- HTTP のテストでクエリの検証・ステータス・`Content-Type`・`Content-Disposition` を確かめる。
- 書き込み（PR 1・2）は DB のテストでも保存を確かめる。
