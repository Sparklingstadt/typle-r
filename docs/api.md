# API（Go）

GitHubでログインしたアカウントのクラウド保存（`typle_workspaces`）を、スクリプトや別のアプリから読み書きするためのAPIです。`server/` のGoサーバーで、Typle本体とは別に起動します。Vercelの本番には載せていません。

- 既定は読み取り専用です。`GET`・`HEAD` 以外は `405 methodNotAllowed` で、DBへの接続も読み取り専用（`default_transaction_read_only=on`）のため、書き込みはDBが拒否します。
- `-writable` を付けて起動すると、リストの作成・変更・削除と記録の追加（v0.42.0 から）、リストの複製（v0.47.0 から）、CSV・TSV の取り込み（v0.48.0 から）、端末の作成・変更・削除（v0.44.0 から）、記録の変更・削除（v0.45.0 から）もできます。
- GitHubのトークンで認証します。読み書きできるのは、そのトークンのGitHubユーザー本人のアカウント（アプリにGitHubでログインしたときと同じ `github:<ユーザーID>`）のデータだけです。ほかのアカウントのデータには届きません。
- 形は v0.35.x までの `/api/v1` と同じです。共有リンクとプロファイルを削除したため `shared`・`shareUrl` と `/profiles/{p}` はありません。
- ブラウザー保存（ログインしていないとき）のデータはサーバーにないため扱えません。

## 起動

Go 1.25以上が必要です。

```sh
cd server
DATABASE_URL='postgresql://…' go run ./cmd/typle-api
```

| 設定 | 既定 | 内容 |
|---|---|---|
| `DATABASE_URL`（なければ `POSTGRES_URL`） | なし（必須） | アプリと同じDBの接続文字列。読み取り専用のロールを使うと、より安全です |
| `-addr` | `127.0.0.1:8080` | 待ち受けるアドレス |
| `-writable` | なし（読み取り専用） | 書き込みを受け付ける。DBのロールに `typle_workspaces` の `SELECT`・`INSERT`・`UPDATE` の権限が要る |

- 起動時にDBへ接続を確かめ、できなければ終了します。起動のログに `read-only` か `read-write` かを出します。
- データはリクエストごとにDBから読みます。アプリで保存した変更は次のリクエストから見えます。
- 既定では `127.0.0.1` だけで待ち受けます。ほかの端末から使う場合は、トークンが平文で流れないよう、HTTPSのリバースプロキシの後ろに置いてください。
- まだ一度も保存していないアカウント（行がない）は、アプリと同じく最初の単語リスト（サンプルと国名193か国）を返します。
- `sslmode=prefer`・`require`・`verify-ca` は、アプリと同じく `verify-full` として接続し、サーバー証明書を検証します（`uselibpqcompat=true` のときはそのまま）。Neonの `channel_binding=require` も使えます。
- 検証はアプリの読み込みと同じです（任意の項目の `null` だけは、省略と同じに扱います）。保存データが読めないときは `503 databaseUnavailable` を返し、理由をログに出します。
- 以前の共有の項目（`shared`・`shareId`）は読み込み時に捨てます。ほかの知らない項目（リスト・単語・記録・記録の端末）は、アプリと同じく残し、書き込みでも消しません。
- 記録の日時は `toISOString` の形（`2026-10-10T02:00:00.000Z`）と、`2024/09/22 10:05` のような形を読みます。時差のない日時はサーバーのタイムゾーンで解釈するため、ブラウザーと違う場合は `TZ=Asia/Tokyo` などを指定します。

## 認証

すべてのリクエストに `Authorization: Bearer <GitHubのトークン>` を付けます。

```sh
export TYPLE_TOKEN="$(gh auth token)"   # または GitHub の個人用アクセストークン
curl -H "Authorization: Bearer $TYPLE_TOKEN" http://127.0.0.1:8080/api/v1/lists
```

- サーバーはトークンで GitHub の `GET /user` を呼び、返ったユーザーIDのアカウントを読みます。サーバー側に秘密値や OAuth App の設定は要りません。
- トークンはユーザーを確かめるためだけに使います。権限（スコープ）は要らないので、Fine-grained の個人用アクセストークンならリポジトリへのアクセスなし・権限なしで作れます。有効期限も付けてください。
- 確認できたトークンは5分間覚えておき、その間は GitHub に問い合わせません。そのため、失効したトークンも最大5分は使えます。メモリーに残すのはトークンのSHA-256だけです。GitHub が受け付けなかったトークンは覚えません。
- ヘッダーがない、形式が違う（`Bearer` 以外、空白を含むなど）、GitHub が受け付けないトークンは、すべて `401 invalidToken` で、`WWW-Authenticate: Bearer` を付けます。
- GitHub に届かない、レート制限（403・429）、GitHub の障害のときは `503 githubUnavailable` です。トークンが悪いとは限らないので、しばらくしてからやり直します。
- 未知のパス（`404 notFound`）と、そのパスで使えないメソッド（`405`）は、認証より先に返します。書き込みの本文は認証の後で読みます。
- `-writable` のときは、GitHub で本人と確かめられたトークンなら書き込めます。トークンの権限（スコープ）では区別しません。書き込みを許したくないときは `-writable` を付けずに起動してください。

## 共通事項

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）、`Cache-Control: no-store` です。
- CORSヘッダーは付けないため、ブラウザーの他サイトからは呼べません。サーバーやスクリプトから利用してください。
- エラーは `{ "error": "<キー>" }` です。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidQuery` | `since`・`limit` が不正 |
| 400 | `invalidJson` | 本文がJSONの1つのオブジェクトでない、型が違う、未知の項目がある（項目名は大文字小文字まで一致が必要）、`PATCH` で `name`・`words` のどちらもない |
| 400 | `listNameRequired`・`listNameDuplicate`・`wordsRequired`・`wordFieldsRequired`・`invalidList`・`listLimit` | リストの内容が不正（下の「リストの検証」） |
| 400 | `invalidRecord`・`recordLimit`・`deviceNotFound` | 記録の内容が不正（下の「記録の検証」） |
| 400 | `deviceNameRequired`・`deviceNameTooLong`・`deviceLayoutTooLong`・`deviceNameDuplicate`・`deviceLimit`・`invalidDevice` | 端末の内容が不正（下の「端末の検証」） |
| 401 | `invalidToken` | トークンがない、形式が違う、または GitHub が受け付けない |
| 404 | `listNotFound` | 指定したIDのリストがない |
| 404 | `deviceNotFound` | パスで指定したIDの端末がない（組み込みの `default` も） |
| 404 | `recordNotFound` | パスで指定したIDの記録がない（IDのない古い記録も） |
| 404 | `notFound` | 未知のパス |
| 405 | `methodNotAllowed` | そのパスで使えないメソッド（`-writable` でない書き込みを含む）。`Allow` に使えるメソッドを付ける |
| 413 | `requestTooLarge` | 本文が 1MiB を超える |
| 413 | `workspaceTooLarge` | 保存後のリスト全体が 896KiB を超える |
| 415 | `unsupportedContentType` | 書き込みの `Content-Type` の `;` より前が `application/json` でない |
| 503 | `githubUnavailable` | GitHub でトークンを確かめられない。しばらくしてからやり直す |
| 503 | `databaseUnavailable` | DBの障害、または保存済みのデータが読めない。しばらくしてからやり直す |

## エンドポイント

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

### `GET /api/v1/lists`

リストの一覧です。単語は含みません。

| クエリ | 内容 |
|---|---|
| `sort` | 省略すると保存順（古い順）。`added`（新しく追加した順）、`practiced`（最後に練習した順。練習していないリストは後ろ）、`name`（名前順。日本語の照合で、数字は数として比べる）、`words`（単語の多い順）。同じ順位は新しく追加した順。ほかの値は `400 invalidQuery`（v0.50.0 から） |
| `q` | 名前か、いずれかの単語の `display`・`input` に含まれるリストだけ（大文字小文字を区別しない）。空なら全部（v0.50.0 から） |

並べ方と検索はアプリの「単語リスト」画面と同じです。名前順は Go の照合表（CLDR 23）を使うため、半角カナ・ギリシャ文字・記号で始まる名前は、ブラウザーと順序が違うことがあります。

`practiceCount`（練習回数。`recordCount` と同じ値）、`lastPracticed`（最も新しい記録の日時。なければ `null`）、`currentRecordCount`（今の単語数と同じ単語数の記録の数。ベスト記録の比較に使う記録）は v0.50.0 からです（`GET /api/v1/lists/{l}` にもあります）。

```json
{
  "lists": [{
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "英単語",
    "wordCount": 120,
    "recordCount": 8,
    "createdAt": "2026-10-10T01:23:45.000Z"
  }]
}
```

### `GET /api/v1/lists/{l}`

単語を含む詳細です。

```json
{
  "list": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "英単語",
    "wordCount": 1,
    "recordCount": 8,
    "createdAt": "2026-10-10T01:23:45.000Z",
    "words": [{ "display": "apple", "input": "apple", "annotation": "りんご" }]
  }
}
```

### `GET /api/v1/lists/{l}/words.csv`

リストの単語を、アプリの「CSV書き出し」と同じ CSV で返します（v0.48.0 から）。BOM 付き、見出し `input,display,annotation`、すべての項目を `"` で囲み、改行は CRLF です。`Content-Type: text/csv; charset=utf-8`、`Content-Disposition` にリスト名から作ったファイル名（アプリと同じ規則）を付けます。

### `GET /api/v1/lists/{l}/records`

練習記録を新しい順（`date` の降順。同じ日時は保存順）に返します。

| クエリ | 内容 |
|---|---|
| `since` | 日時（上の日時の形）。その時刻より後の記録だけを返す |
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

記録は保存されている形のまま（Typleの知らない項目も含めて）返します。古い記録には `id`・`mistakes`・`accuracy`・`wordCount`・`device` がないことがあります。

### `GET /api/v1/lists/{l}/records/{r}`

`id` が `{r}` の記録1件です（`{ "record": … }`、形は上と同じ）。`id` のない古い記録は指定できないため、`404 recordNotFound` です。

### `GET /api/v1/records`

すべてのリストの記録を新しい順に返します。アプリの「練習記録」と同じです（v0.51.0 から）。同じ日時の記録はリストの順・保存順です。

| クエリ | 内容 |
|---|---|
| `list` | そのリストの記録だけ。知らない ID なら空 |
| `device` | その端末の記録だけ（端末の ID。名前を変えた後の記録も含む）。`none` は端末のない記録 |
| `since`・`limit` | `GET /api/v1/lists/{l}/records` と同じ |
| `tz` | `day` を数えるタイムゾーン（IANA 名。例 `Asia/Tokyo`）。省略するとサーバーのタイムゾーン |

各記録は保存されている形に、`listId`・`listName`・`best`（そのリストの今のベストか）・`day`（`tz` での日付 `YYYY-MM-DD`。アプリの日ごとのまとめの区切り）を足したものです。不正な値は `400 invalidQuery` です。

```json
{ "records": [{ "id": "r1", "time": 4.25, "date": "2026-10-10T20:00:00.000Z", "accuracy": 100, "listId": "l1", "listName": "英単語", "best": true, "day": "2026-10-11" }] }
```

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

## 書き込み（`-writable` のとき）

本文は `Content-Type: application/json` のJSONオブジェクトで、1MiB までです（本文のない `DELETE` と複製を除く）。応答の `list` は `GET /api/v1/lists/{l}` と同じ形です。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/lists` | `{ "name", "words": [{ "display", "input", "annotation"? }] }` | `201 { "list" }`。IDはサーバーが UUID で決め、`createdAt` は今の時刻。最後に追加する |
| `PATCH /api/v1/lists/{l}` | `{ "name"?, "words"? }`（少なくとも一方） | `200 { "list" }`。`words` は全体を置き換える。記録・`createdAt`・並び順は残る |
| `DELETE /api/v1/lists/{l}` | なし | `204`（本文なし）。記録も一緒に消える |
| `POST /api/v1/lists/{l}/copy` | なし、または `{ "name"? }` | `201 { "list" }`。単語をコピーし、記録はコピーしない。名前を省略すると「元の名前（コピー）」、使われていれば「（コピー2）」…（200文字に収まるよう元の名前を切る）。最後に追加する（v0.47.0 から） |
| `POST /api/v1/lists/import?name=…&format=csv\|tsv` | CSV・TSV のファイルそのもの（`Content-Type` は `text/csv`・`text/tab-separated-values`・`text/plain`。1MiB まで） | `201 { "list" }`。アプリの「CSV・TSVファイルから追加」と同じ読み方で単語を読み、`name` の名前のリストを作る（v0.48.0 から） |
| `POST /api/v1/lists/{l}/records` | `{ "id"?, "time", "date", "mistakes", "accuracy", "wordCount"?, "deviceId"? }` | 追加したら `201 { "record" }`。同じリストに同じ `id` の記録があれば追加せず、保存済みの記録を `200 { "record" }` で返す |
| `POST /api/v1/devices` | `{ "name", "layout"? }` | `201 { "device" }`。IDはサーバーが UUID で決める。最後に追加する |
| `PATCH /api/v1/devices/{d}` | `{ "name"?, "layout"? }`（少なくとも一方） | `200 { "device" }` |
| `PATCH /api/v1/lists/{l}/records/{r}` | `{ "time"?, "date"?, "mistakes"?, "accuracy"?, "wordCount"?, "deviceId"? }`（少なくとも1つ） | `200 { "record" }`。送らなかった項目とTypleの知らない項目は残る。`id` は変えられない |
| `DELETE /api/v1/lists/{l}/records/{r}` | なし | `204`（本文なし） |
| `DELETE /api/v1/devices/{d}` | なし | `204`（本文なし） |

記録には練習したときの端末のコピーが入っているため、端末の名前を変えても削除しても、過去の記録の端末はそのままです（アプリと同じ）。組み込みの `default` は変更・削除できません（`404 deviceNotFound`）。

### リストの検証

アプリでリストを保存するときと同じです。

- `name`: 前後の空白を除いて1文字以上（`listNameRequired`）、ほかのリストと同じ名前は不可（前後の空白を除き、大文字小文字を区別しない。比べ方はアプリと同じJavaScriptの `toLowerCase` で、語末の `Σ` は `ς`、`İ` は `i̇` になる。`listNameDuplicate`）。前後の空白を除いて保存する。
- `words`: 1件以上（`wordsRequired`）。`display`・`input` は空白だけでない文字列（`wordFieldsRequired`）。`annotation` は省略すると `""`。単語の前後の空白はそのまま保存する。
- 長さ（UTF-16の文字数）: 名前200、単語1000件、`display`・`input` 1000、`annotation` 2000。超えると `invalidList`。NUL文字（`\u0000`）はDBに保存できないため、名前・単語のどこにあっても `invalidList`。
- リストが100件あるときの作成は `listLimit`。

### CSV・TSV の取り込み

アプリで取り込むときと同じです。

- 1行目は見出しで、`input`・`display` が必須、`annotation` は任意（誤記の `anotation` も読む）。順番は問わない。
- `"` で囲んだ項目には区切り文字・改行・`""`（`"` 1文字）を入れられる。先頭の BOM と空行は読み飛ばす。単語の前後の空白・順序・重複はそのまま保存する。
- 誤りは `400` で、行番号があるものは `line` を付ける（例 `{ "error": "importQuote", "line": 3 }`）: `importQuote`（引用符の誤り）、`importHeaderRequired`・`importHeaderDuplicate`・`importHeaderUnknown`（見出し）、`importNoRows`、`importTooManyRows`（1000行超）、`importColumnCount`（列数）、`importFieldRequired`（`input`・`display` が空）、`importFieldTooLong`（1000文字超、`annotation` は2000文字超）。1MiB を超えると `413 importTooLarge`。
- リスト名は作成と同じ検証（`listNameRequired`・`listNameDuplicate`・`invalidList`・`listLimit`）。`format` がないか `csv`・`tsv` 以外なら `400 invalidQuery`。

### 端末の検証

アプリで端末を保存するときと同じです。

- `name`: 前後の空白を除いて1文字以上（`deviceNameRequired`）、100文字まで（`deviceNameTooLong`）。`layout`: 省略すると `""`、200文字まで（`deviceLayoutTooLong`）。長さは前後の空白を含めて数え、保存するときに前後の空白を除く。
- ほかの端末と同じ名前は不可（大文字小文字を区別しない。比べ方はリスト名と同じ）。組み込みの「デフォルト」と同じ名前も不可で、アプリの6言語での名前（デフォルト・Default・默认・預設・По умолчанию・Par défaut）と比べる（`deviceNameDuplicate`）。
- 端末は100台まで（`deviceLimit`）。NUL文字（`\u0000`）は `invalidDevice`。

### 記録の検証

- `time`: 0以上の数（秒）。`date`: 上の日時の形。保存するときに `2026-10-10T02:00:00.000Z` の形（UTC）にそろえる。
- `mistakes`: 0以上の整数。`accuracy`: 0〜100の数。`wordCount`: 1以上の整数で、省略するとリストの今の単語数。
- `id`: 1〜100文字の英数字・`_`・`-`。省略するとサーバーが UUID で決める。同じ `id` で送り直しても記録は増えないので、失敗したら同じ本文でやり直せます。
- `deviceId`: 省略できる。登録済みの端末のIDなら、その名前と配列を記録にコピーする。`default` は組み込みの「デフォルト」。どちらでもなければ `deviceNotFound`。
- 1リストの記録は10000件まで（`recordLimit`）。ほかの誤りは `invalidRecord`。
- 変更（`PATCH`）も同じ規則です。`deviceId` に `""` を指定すると記録から端末を外します（アプリの「未選択」と同じ）。
- 変更・削除できるのは `id` のある記録だけです。`id` のない古い記録は、アプリの「練習記録」から削除してください。

### アプリと同時に保存したとき

書き込みは1つのトランザクションでアカウントの行をロックし、リストを変えて `revision` を1増やします。その間のアプリの保存は待ち、そのあとは「ほかで保存された」として読み込み直します（アプリで2つのブラウザーから保存したときと同じ）。読み込み直す前にアプリで行った変更は保存されないので、APIで書き込むときはアプリの編集を終えておいてください。

- まだ一度も保存していないアカウントは、最初の単語リストに変更を加えて保存します。
- 同じ `id` の記録の送り直しなど、何も変わらないときは保存しません。
- 保存後のリスト全体（JSON）が 896KiB を超える変更は `413 workspaceTooLarge` で、何も保存しません。アプリの保存（1MiB まで）に端末などの分を残すためです。すでに超えていても、小さくする変更（削除など）はできます。

## 例

```sh
curl -H "Authorization: Bearer $TYPLE_TOKEN" http://127.0.0.1:8080/api/v1/lists
curl -H "Authorization: Bearer $TYPLE_TOKEN" \
  "http://127.0.0.1:8080/api/v1/lists/$LIST_ID/records?since=2026-10-01T00:00:00Z&limit=20"

# -writable で起動したとき
curl -H "Authorization: Bearer $TYPLE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"動物","words":[{"display":"猫","input":"neko","annotation":"cat"}]}' \
  http://127.0.0.1:8080/api/v1/lists
curl -H "Authorization: Bearer $TYPLE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"run-2026-10-20-001","time":12.3,"date":"2026-10-20T21:00:00+09:00","mistakes":1,"accuracy":98.5}' \
  "http://127.0.0.1:8080/api/v1/lists/$LIST_ID/records"
```

## 開発

```sh
cd server
gofmt -l .
go vet ./...
TYPLE_TEST_DATABASE_URL=postgresql://typle:…@127.0.0.1:5432/typle go test ./...
```

DBのテスト（読み取りと書き込み）は、`npm run db:migrate` 済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定したときだけ実行します（ランダムなアカウントIDの行を作って、終わったら消します。本番のDBは指定しないでください）。CIの `verify` は `db:migrate` の後に同じ確認をします。最初の単語リストは `src/plugins/packs` のコピーを `server/internal/workspace/packs` に埋め込んでいます。元を変えたら `go generate ./...` でコピーし直します（違うと `go test` が失敗します）。

## 範囲外

- GitHub 以外の認証、ブラウザーでのログイン画面、許可するユーザーの制限
- ローカルの開発用ログインのアカウント（`github:0`）。GitHub のトークンでは名乗れない
- `id` のない記録の変更・削除、記録の別のリストへの移動、リストや端末の並べ替え、単語単位の追加・削除
- トークンごとの読み取り・書き込みの区別（書き込みはサーバーの `-writable` で決める）
- ブラウザー保存のデータ
