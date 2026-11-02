# 読み取り

`-writable` でなくても使えるエンドポイントです。

## 端末

### `GET /api/v1/devices`

登録した練習端末の一覧です。組み込みの「デフォルト」は含みません（記録の `device.id` は `default` になります）。

```json
{
  "devices": [{ "id": "d1", "name": "自宅のキーボード", "layout": "JIS", "practiceCount": 12, "lastPracticed": "2026-10-20T02:00:00.000Z" }],
  "default": { "practiceCount": 3, "lastPracticed": "2026-10-19T09:00:00.000Z" }
}
```

`practiceCount`・`lastPracticed` は、アプリの「端末」画面の練習回数と最後に練習した日です（v0.49.0 から）。すべてのリストの記録を、記録に入っている端末の `id` で数えるため、名前を変えた後も引き継がれます。`lastPracticed` は最も新しい記録の `date`（保存されている形のまま）で、記録がなければ `null`。`default` は組み込みの「デフォルト」の分です。

### `GET /api/v1/devices/{d}`

登録した端末1台です（`{ "device": { "id", "name", "layout", "practiceCount", "lastPracticed" } }`）。組み込みの `default` は登録した端末ではないため、`404 deviceNotFound` です。

## リスト

### `GET /api/v1/lists`

リストの一覧です。単語は含みません。

| クエリ | 内容 |
|---|---|
| `sort` | 省略すると保存順（古い順）。`added`（新しく追加した順）、`practiced`（最後に練習した順。練習していないリストは後ろ）、`name`（名前順。日本語の照合で、数字は数として比べる）、`words`（単語の多い順）。同じ順位は新しく追加した順。ほかの値は `400 invalidQuery`（v0.50.0 から） |
| `q` | 名前か、いずれかの単語の `display`・`input` に含まれるリストだけ（大文字小文字を区別しない）。空なら全部（v0.50.0 から）。v0.78.0 からカテゴリとタグも探す |
| `category` | そのカテゴリのリストだけ（大文字小文字を区別しない）。`category=`（空）ならカテゴリのないリストだけ（v0.78.0 から） |
| `tag` | そのタグを持つリストだけ。`tag=Go&tag=CLI` のように複数並べると、すべてを持つリストだけ（大文字小文字を区別しない。v0.78.0 から） |

```json
{
  "lists": [{
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "packId": "pack-7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "英単語",
    "category": "語学",
    "tags": ["英語"],
    "levels": [],
    "wordCount": 120,
    "recordCount": 8,
    "createdAt": "2026-10-10T01:23:45.000Z",
    "origin": null
  }]
}
```

| 項目 | 内容 |
|---|---|
| `packId` | そのリストが入っている単語パックの ID（v0.91.0 から）。パックそのものは [`GET /api/v1/packs`](#get-api-v1-packs) で読める |
| `category`・`tags` | リストではなくパックの値（同じパックのリストは同じ値になる） |
| `levels` | 練習画面でパックの中のリストを選ぶ難易度。ないときは `[]`（v0.95.0 から。v0.97.0 から多くても 1 つ） |
| `origin` | フォロー中の公式パックのリストだけが持つ元の公式リストの ID（`{ "listId": "…" }`）。ほかのリストは `null`（v0.98.0 から。[フォロー中の公式パック](./write.md#フォロー中の公式パック)） |
| `practiceCount` | 練習回数。`recordCount` と同じ値（v0.50.0 から） |
| `lastPracticed` | 最も新しい記録の日時。なければ `null`（v0.50.0 から） |
| `currentRecordCount` | 今の単語数と同じ単語数の記録の数。ベスト記録の比較に使う記録（v0.50.0 から） |

`packId`・`levels`・`origin`・`practiceCount`・`lastPracticed`・`currentRecordCount` は [`GET /api/v1/lists/{l}`](#get-api-v1-lists-l) と作成・更新の応答の `list` にもあります。作成・変更での `packId`・`levels` は [書き込み](./write.md) を見てください。

並べ方と検索はアプリの「単語リスト」画面と同じです。名前順は Go の照合表（CLDR 23）を使うため、半角カナ・ギリシャ文字・記号で始まる名前は、ブラウザーと順序が違うことがあります。

### `GET /api/v1/lists/{l}`

単語を含む詳細です。フォロー中の公式パックのリストも、公式の単語を返します。

```json
{
  "list": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "英単語",
    "packId": "pack-7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "category": "語学",
    "tags": ["英語"],
    "levels": [],
    "wordCount": 1,
    "recordCount": 8,
    "createdAt": "2026-10-10T01:23:45.000Z",
    "words": [{ "display": "apple", "input": "apple", "annotation": "りんご" }]
  }
}
```

### `GET /api/v1/lists/{l}/words.csv`

リストの単語を、アプリの「CSV書き出し」と同じ CSV で返します（v0.48.0 から）。BOM 付き、見出し `input,display,annotation`、すべての項目を `"` で囲み、改行は CRLF です。`Content-Type: text/csv; charset=utf-8`、`Content-Disposition` にリスト名から作ったファイル名（アプリと同じ規則）を付けます。

## パック

### `GET /api/v1/packs`

単語パックの一覧を保存順で返します（v0.95.0 から）。中のリストは含みません。

| クエリ | 内容 |
|---|---|
| `q` | パックの名前か、中のいずれかのリストの名前・カテゴリ・タグ・単語の `display`・`input` に含まれるパックだけ（大文字小文字を区別しない。アプリの「単語パック」画面の検索と同じ）。空なら全部 |
| `category` | そのカテゴリのパックだけ（大文字小文字を区別しない）。`category=`（空）ならカテゴリのないパックだけ |
| `tag` | そのタグを持つパックだけ。複数並べると、すべてを持つパックだけ（大文字小文字を区別しない） |

```json
{
  "packs": [{
    "id": "pack-7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "Linux",
    "description": "よく使うコマンド",
    "category": "プログラミング",
    "tags": ["シェル"],
    "origin": { "catalogId": "pack-7c9e6679-7425-40de-944b-e07fc1f90ae7", "version": 1, "followed": true },
    "createdAt": "2026-10-10T01:23:45.000Z",
    "listCount": 2,
    "wordCount": 120,
    "practiceCount": 8,
    "practicedListCount": 1,
    "lastPracticed": "2026-10-20T02:00:00.000Z"
  }]
}
```

- `description`・`category` はないとき `null`、`tags` は `[]`。`origin` はフォロー中の公式パックの出どころ（`catalogId`・`version`・`"followed": true`）で、ほかは `null`（v0.98.0 から。それまでは公式パックのカタログから追加したパックと最初のパックの出どころで、`followed` はなかった）。
- `listCount`・`wordCount` は中のリストと単語の数、`practiceCount` は中のリストの記録の合計、`practicedListCount` は記録のあるリストの数、`lastPracticed` は中のリストで最も新しい記録の日時（なければ `null`）です。

### `GET /api/v1/packs/{p}`

パック1つです（`{ "pack": { …, "lists": [...] } }`）。`GET /api/v1/packs` の各項目に、中のリストを保存順で並べた `lists`（`GET /api/v1/lists` の各項目と同じ形）を足したものです。ないパックは `404 packNotFound`。

### `GET /api/v1/packs/{p}/export`

パックを、アプリの「ファイルに書き出す」と同じパックのファイルで返します（`Content-Type: application/json; charset=utf-8`）。`Content-Disposition` のファイル名は `<パック名>.typle-pack.json` で、パック名は `words.csv` のリスト名と同じ規則で扱います。中身は記録・ID・作成日時・`origin` を含まない次の形で、2スペースのインデントと末尾の改行で書きます。空の任意項目は書きません。

```json
{
  "format": "typle-pack",
  "version": 1,
  "pack": { "name": "Linux", "description": "よく使うコマンド", "category": "プログラミング", "tags": ["シェル"] },
  "lists": [{ "name": "基本", "levels": ["初級"], "words": [{ "display": "ls", "input": "ls", "annotation": "一覧" }] }]
}
```

本番の [`GET /api/shared`](/app/shares.md) も同じ形を返します。

## 記録

### `GET /api/v1/lists/{l}/records`

練習記録を新しい順（`date` の降順。同じ日時は保存順）に返します。

| クエリ | 内容 |
|---|---|
| `since` | 日時（[起動](./README.md#起動)で書いた日時の形）。その時刻より後の記録だけを返す |
| `limit` | 1〜1000の整数（既定100） |

`since=abc`、`limit=0`、`limit=1001`、`limit=1.5` のような値は `400 invalidQuery` です。

```json
{
  "records": [{
    "id": "run-2026-10-10-001",
    "time": 63.5,
    "date": "2026-10-10T02:00:00.000Z",
    "mistakes": 2,
    "accuracy": 97.5,
    "wordCount": 120,
    "device": { "id": "d1", "name": "自宅のキーボード", "layout": "JIS" }
  }]
}
```

記録は保存されている形のまま（Typleの知らない項目も含めて）返します。古い記録には `id`・`mistakes`・`accuracy`・`wordCount`・`device` がないことがあります。手書き練習（Typle Writing）の記録には `"mode": "writing"` が付き、タイピングの記録には `mode` がありません。

v1.3.0 から、記録は `typle_records` テーブルに保存されます。リストの記録がテーブルだけにあるときは、ワークスペース全体を読まずにテーブルから `since`・`limit` の分だけ読みます（答えは同じです）。`id` のない古い記録には、テーブルへ移すときに `legacy-` で始まる変わらない `id` が付きます。

### `GET /api/v1/lists/{l}/records/{r}`

`id` が `{r}` の記録1件です（`{ "record": … }`、形は上と同じ）。`id` のない古い記録は指定できないため、`404 recordNotFound` です。

### `GET /api/v1/records`

すべてのリストの記録を新しい順に返します。アプリの「練習記録」と同じです（v0.51.0 から）。同じ日時の記録はリストの順・保存順です。

| クエリ | 内容 |
|---|---|
| `list` | そのリストの記録だけ。知らない ID なら空 |
| `device` | その端末の記録だけ（端末の ID。名前を変えた後の記録も含む）。`none` は端末のない記録 |
| `since`・`limit` | [`GET /api/v1/lists/{l}/records`](#get-api-v1-lists-l-records) と同じ |
| `tz` | `day` を数えるタイムゾーン（IANA 名。例 `Asia/Tokyo`）。省略するとサーバーのタイムゾーン |

各記録は保存されている形に、`listId`・`listName`・`best`（そのリストの今のベストか）・`day`（`tz` での日付 `YYYY-MM-DD`。アプリの日ごとのまとめの区切り）を足したものです。不正な値は `400 invalidQuery` です。

```json
{ "records": [{ "id": "r1", "time": 4.25, "date": "2026-10-10T20:00:00.000Z", "accuracy": 100, "listId": "l1", "listName": "英単語", "best": true, "day": "2026-10-11" }] }
```

## ベスト記録

### `GET /api/v1/rankings`

リストごとのベスト記録です。アプリの「ベスト記録」と同じです（v0.52.0 から）。記録のないリストも含みます。

| クエリ | 内容 |
|---|---|
| `device` | その端末の記録だけで順位を付ける。`none` は端末のない記録。省略すると全部 |
| `order` | `accuracy`（既定。正確率の高い順、同じなら速い順）か `speed`（速い順、同じなら正確率の高い順）。正確率のない古い記録は最後 |
| `sort` | `recent`（既定。最後に練習した順）、`name`（名前順。日本語の照合で、数字は文字として比べる）、`count`（記録の多い順） |

```json
{ "rankings": [{ "listId": "l1", "listName": "英単語", "wordCount": 20, "recordCount": 8, "best": { …記録… }, "lastPracticed": "2026-10-20T02:00:00.000Z", "improved": true }] }
```

- 順位は、今の単語数と同じ単語数の記録で付けます（その記録がなければ全部で）。`best` はその1位で、記録がなければ `null`。`recordCount` は選んだ端末での記録の数です。
- `improved` は、ベストが7日以内に出て、それより前の記録がある（記録を更新した）ことを表します。

### `GET /api/v1/rankings/{l}`

1つのリストの順位の詳細です（v0.52.0 から）。`device`・`order` は上と同じで、`includeOthers=true` にすると今と違う単語数の記録も順位に入れます。

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

- `ranked` はすべての記録です（アプリは上位5件を表示します）。`fallback` は今の単語数の記録が1件もなく、ほかの単語数の記録で順位を付けたこと。`otherCounts` は今と違う単語数の記録の数で、`wordCount` が `null` のものは単語数を記録していない古い記録です。
- `stats` は順位を付けた記録の、直近5回の平均時間・平均正確率（正確率のない記録は除く。なければ `null`）と、直近20回の時間の推移（古い順）です。

## ホーム

### `GET /api/v1/dashboard`

アプリの「ホーム」の集計です（v0.53.0 から）。週は月曜はじまり、日の区切りは `tz`（[`GET /api/v1/records`](#get-api-v1-records) と同じ。省略するとサーバーのタイムゾーン）です。

```json
{
  "summary": {
    "weekStart": "2026-10-18T15:00:00.000Z", "weekCount": 12, "previousWeekCount": 9, "weekSeconds": 540.5, "previousWeekSeconds": 410,
    "streak": 3, "practicedToday": true,
    "accuracy": { "recent": 96.2, "recentCount": 10, "change": { "recent": 96.2, "recentCount": 10, "previous": 94.1, "previousCount": 10 } }
  },
  "next": [
    { "listId": "l2", "listName": "新しいリスト", "lastPracticed": null, "reason": { "kind": "new" } },
    { "listId": "l3", "listName": "地名", "lastPracticed": "2026-10-14T01:00:00.000Z", "reason": { "kind": "stale", "days": 6 } },
    { "listId": "l1", "listName": "英単語", "lastPracticed": "2026-10-19T01:00:00.000Z", "reason": { "kind": "accuracy", "accuracy": 85.5, "count": 5 } }
  ],
  "trends": [{
    "listId": "l1", "listName": "英単語", "count": 8, "lastPracticed": "…",
    "speed": { "points": [{ "date": "…", "value": 2.1 }], "change": { "recent": 2.0, "recentCount": 4, "previous": 2.3, "previousCount": 4 } },
    "accuracy": { "points": [{ "date": "…", "value": 95 }], "change": null },
    "best": { …記録… }
  }]
}
```

- `summary`：`weekStart` は今週の月曜0時です。`previousWeekCount`・`previousWeekSeconds` は先週の同じ曜日・時刻までの数です（週のはじめに1週間分と比べないため）。`streak` は練習した日の連続日数で、今日まだ練習していなければ昨日から数えます。`accuracy` は正確率のある直近10回の平均で、`change` はその前の10回（あれば最大10回）との比較です。正確率のある記録がなければ `null`。
- `next`：次に練習するリストを最大3件、理由ごとに順に選びます。`new` は記録のないリスト、`stale` は最後の練習から3日以上たったリスト（日数の多い順）、`accuracy` は直近5回の平均正確率が90%未満のリスト（低い順）です。
- `trends`：記録のあるリストを最後に練習した順に並べます。`speed` は1単語あたりの秒数、`accuracy` は正確率の推移で、`points` は直近20回（古い順）、`change` は新しい半分（最大5回）とその前の同じ数との比較です（比べられなければ `null`）。`best` はそのリストのベストです（[`GET /api/v1/rankings`](#get-api-v1-rankings) の `best` と同じ）。
- 記録が1件もなくても、同じ形で返します（`weekCount` は `0`、`accuracy` は `null`、`trends` は `[]`）。
