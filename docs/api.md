# API（Go）

GitHubでログインしたアカウントのクラウド保存（`typle_workspaces`）を、スクリプトや別のアプリから読み書きするためのAPIです。`server/` のGoサーバーで、Typle本体とは別に起動します。Vercelの本番には載せていません（v0.55.0 でもそのままです。本番の Go の関数は、アプリ自身のログインと保存の `/api/auth/*`・`/api/workspace`・`/api/health` だけです）。

- iPad 版は v0.56.0 から、Android 版は v0.57.0 から、この API を使いません。Windows 版（v0.59.0 から）と Mac 版（v0.60.0 から）も使いません。どれも Web版と同じ GitHub ログインで本番の `/api/workspace` を使います（[README の「iPad と Mac と Android と Windows のログイン」](../README.md#ipad-と-mac-と-android-と-windows-のログイン)）。
- 既定は読み取り専用です。`GET`・`HEAD` 以外は `405 methodNotAllowed` で、DBへの接続も読み取り専用（`default_transaction_read_only=on`）のため、書き込みはDBが拒否します。
- `-writable` を付けて起動すると、リストの作成・変更・削除と記録の追加（v0.42.0 から）、リストの複製（v0.47.0 から）、CSV・TSV の取り込み（v0.48.0 から）、端末の作成・変更・削除（v0.44.0 から）、記録の変更・削除（v0.45.0 から）もできます。
- GitHubのトークンで認証します。読み書きできるのは、そのトークンのGitHubユーザー本人のアカウント（アプリにGitHubでログインしたときと同じ `github:<ユーザーID>`）のデータだけです。ほかのアカウントのデータには届きません。
- 形は v0.35.x までの `/api/v1` と同じです。共有リンクとプロファイルを削除したため `shared`・`shareUrl` と `/profiles/{p}` はありません。
- ブラウザー保存（ログインしていないとき）のデータはサーバーにないため扱えません。

## 起動

Go 1.25以上が必要です。

```sh
DATABASE_URL='postgresql://…' go run ./server/cmd/typle-api
```

| 設定 | 既定 | 内容 |
|---|---|---|
| `DATABASE_URL`（なければ `POSTGRES_URL`） | なし（必須） | アプリと同じDBの接続文字列。読み取り専用のロールを使うと、より安全です |
| `-addr` | `127.0.0.1:8080` | 待ち受けるアドレス |
| `-writable` | なし（読み取り専用） | 書き込みを受け付ける。DBのロールに `typle_workspaces` の `SELECT`・`INSERT`・`UPDATE` の権限が要る |

- 起動時にDBへ接続を確かめ、できなければ終了します。起動のログに `read-only` か `read-write` かを出します。
- データはリクエストごとにDBから読みます。アプリで保存した変更は次のリクエストから見えます。
- 遅い送受信や使われない接続を持ち続けないよう、リクエストの読み込みは30秒、応答は1分、待機中の接続は2分で切ります。
- 既定では `127.0.0.1` だけで待ち受けます。ほかの端末から使う場合は、トークンが平文で流れないよう、HTTPSのリバースプロキシの後ろに置いてください。
- まだ一度も保存していないアカウント（行がない）は、アプリと同じく最初の単語リスト（v0.85.0 から sparklingstadt アカウントの67リストのコピー）を返します。
- `sslmode=prefer`・`require`・`verify-ca` は、アプリと同じく `verify-full` として接続し、サーバー証明書を検証します（`uselibpqcompat=true` のときはそのまま）。`sslmode` のない URL も、接続先がこの機械（`localhost`・`127.0.0.0/8`・`::1`・Unix ソケット）でなければ `verify-full` にします。Neonの `channel_binding=require` も使えます。
- 検証はアプリの読み込みと同じです（任意の項目の `null` だけは、省略と同じに扱います）。保存データが読めないときは `503 databaseUnavailable` を返し、理由をログに出します。
- 以前の共有の項目（`shared`・`shareId`）は読み込み時に捨てます。ほかの知らない項目（リスト・単語・記録・記録の端末）は、アプリと同じく残し、書き込みでも消しません。
- 記録の日時は `toISOString` の形（`2026-10-10T02:00:00.000Z`）と、`2024/09/22 10:05` のような形を読みます。時差のない日時はサーバーのタイムゾーンで解釈するため、ブラウザーと違う場合は `TZ=Asia/Tokyo` などを指定します。

## 認証

すべてのリクエストに `Authorization: Bearer <GitHubのFine-grainedの個人用アクセストークン>` を付けます。

```sh
export TYPLE_TOKEN="github_pat_…"   # GitHub の Fine-grained の個人用アクセストークン
curl -H "Authorization: Bearer $TYPLE_TOKEN" http://127.0.0.1:8080/api/v1/lists
```

- サーバーはトークンで GitHub の `GET /user` を呼び、返ったユーザーIDのアカウントを読みます。サーバー側に秘密値や OAuth App の設定は要りません。
- 受け付けるのは `github_pat_` で始まる Fine-grained の個人用アクセストークンだけです（v0.54.0 から）。`gh auth token` の値（`gho_`）、ほかのサービスが GitHub 連携で持つトークン（`gho_`・`ghu_` など）、classic の個人用アクセストークン（`ghp_`）は、GitHub に問い合わせずに `401 invalidToken` で断ります。利用者がほかのサービスに渡したトークンで、そのサービスが Typle のデータを読み書きできないようにするためです。
- トークンはユーザーを確かめるためだけに使います。GitHub の Settings → Developer settings → Fine-grained tokens で、リポジトリへのアクセスなし（Public repositories）・権限なしで作り、有効期限も付けてください。Typle 専用に作り、ほかの用途と使い回さないでください。
- 確認できたトークンは5分間覚えておき、その間は GitHub に問い合わせません。そのため、失効したトークンも最大5分は使えます。メモリーに残すのはトークンのSHA-256だけです。GitHub が受け付けなかったトークンは覚えません。
- ヘッダーがない、形式が違う（`Bearer` 以外、空白を含むなど）、Fine-grained でない、GitHub が受け付けないトークンは、すべて `401 invalidToken` で、`WWW-Authenticate: Bearer` を付けます。
- GitHub に届かない、レート制限（403・429）、GitHub の障害のときは `503 githubUnavailable` です。トークンが悪いとは限らないので、しばらくしてからやり直します。
- 覚えていないトークンを GitHub に問い合わせるのは、まとめて20回、その後は1秒に10回までです。でたらめなトークンを大量に送られても、サーバーから GitHub へ大量に問い合わせません。超えた分も `503 githubUnavailable` です。覚えているトークンは制限されません。
- 未知のパス（`404 notFound`）と、そのパスで使えないメソッド（`405`）は、認証より先に返します。書き込みの本文は認証の後で読みます。
- `-writable` のときは、GitHub で本人と確かめられたトークンなら書き込めます。トークンの権限（スコープ）では区別しません。書き込みを許したくないときは `-writable` を付けずに起動してください。

## 共通事項

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）、`Cache-Control: no-store` です。`GET /api/v1/lists/{l}/words.csv` は CSV ファイル、`GET /api/v1/packs/{p}/export` はパックのファイル（JSON）を、`Content-Disposition: attachment` を付けて返します。
- CORSヘッダーは付けないため、ブラウザーの他サイトからは呼べません。サーバーやスクリプトから利用してください。
- エラーは `{ "error": "<キー>" }` です。CSV・TSV の取り込みで行の分かる誤りには、`{ "error": "importQuote", "line": 3 }` のように `line`（1から数える行番号）が付きます。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidQuery` | クエリの値が不正（`since`・`limit`・`tz`・`sort`・`order` など） |
| 400 | `invalidJson` | 本文がJSONの1つのオブジェクトでない、型が違う、未知の項目がある（項目名は大文字小文字まで一致が必要）、`PATCH` で変える項目が1つもない |
| 400 | `listNameRequired`・`listNameDuplicate`・`wordsRequired`・`wordFieldsRequired`・`invalidList`・`listLimit`・`levelsConflict`・`tooManyLevels` | リストの内容が不正（下の「リストの検証」） |
| 400 | `packNameRequired`・`packNameDuplicate`・`invalidPack` | パックの内容が不正（下の「パックの検証」。v0.95.0 から） |
| 400 | `packNotFound` | 本文やクエリの `packId` のパックがない（v0.95.0 から） |
| 400 | `packFileUnreadable` | 取り込むパックのファイルが読めない（下の「パックのファイルの取り込み」。v0.95.0 から） |
| 400 | `invalidRecord`・`recordLimit`・`deviceNotFound` | 記録の内容が不正（下の「記録の検証」） |
| 400 | `deviceNameRequired`・`deviceNameTooLong`・`deviceLayoutTooLong`・`deviceNameDuplicate`・`deviceLimit`・`invalidDevice` | 端末の内容が不正（下の「端末の検証」） |
| 400 | `importFileEncoding`・`importQuote`・`importHeaderRequired`・`importHeaderDuplicate`・`importHeaderUnknown`・`importNoRows`・`importTooManyRows`・`importColumnCount`・`importFieldRequired`・`importFieldTooLong` | 取り込むファイルが不正（下の「CSV・TSV の取り込み」） |
| 401 | `invalidToken` | トークンがない、形式が違う、または GitHub が受け付けない |
| 404 | `listNotFound` | 指定したIDのリストがない |
| 404 | `packNotFound` | パスで指定したIDのパックがない（v0.95.0 から） |
| 404 | `deviceNotFound` | パスで指定したIDの端末がない（組み込みの `default` も） |
| 404 | `recordNotFound` | パスで指定したIDの記録がない（IDのない古い記録も） |
| 404 | `notFound` | 未知のパス |
| 405 | `methodNotAllowed` | そのパスで使えないメソッド（`-writable` でない書き込みを含む）。`Allow` に使えるメソッドを付ける |
| 409 | `packFollowed` | フォロー中の公式パックやそのリストを変えようとした（下の「フォロー中の公式パック」。v0.98.0 から） |
| 413 | `requestTooLarge` | 本文が 1MiB を超える |
| 413 | `importTooLarge` | 取り込むファイル（CSV・TSV・パックのファイル）が 1MiB を超える |
| 413 | `workspaceTooLarge` | 保存後のリスト全体が 896KiB を超える |
| 415 | `unsupportedContentType` | 書き込みの `Content-Type` の `;` より前が `application/json` でない（CSV・TSV の取り込みでは `text/csv`・`text/tab-separated-values`・`text/plain` のどれでもない） |
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
| `q` | 名前か、いずれかの単語の `display`・`input` に含まれるリストだけ（大文字小文字を区別しない）。空なら全部（v0.50.0 から）。v0.78.0 からカテゴリとタグも探す |
| `category` | そのカテゴリのリストだけ（大文字小文字を区別しない）。`category=`（空）ならカテゴリのないリストだけ（v0.78.0 から） |
| `tag` | そのタグを持つリストだけ。`tag=Go&tag=CLI` のように複数並べると、すべてを持つリストだけ（大文字小文字を区別しない。v0.78.0 から） |

`packId`（そのリストが入っている単語パックの ID）は v0.91.0 からで、`GET /api/v1/lists/{l}` と作成・更新の応答の `list` にもあります。`category`・`tags` はリストではなくパックの値です（同じパックのリストは同じ値になります）。`levels`（練習画面でパックの中のリストを選ぶ難易度。ないときは `[]`。v0.97.0 から多くても 1 つ）は v0.95.0 からです。パックそのものは `GET /api/v1/packs` で読めます。作成・変更での `packId`・`levels` は「書き込み」を見てください。`origin` は、フォロー中の公式パックのリストだけが持つ元の公式リストの ID（`{ "listId": "…" }`）で、ほかのリストは `null` です（v0.98.0 から。下の「フォロー中の公式パック」）。

並べ方と検索はアプリの「単語リスト」画面と同じです。名前順は Go の照合表（CLDR 23）を使うため、半角カナ・ギリシャ文字・記号で始まる名前は、ブラウザーと順序が違うことがあります。

`practiceCount`（練習回数。`recordCount` と同じ値）、`lastPracticed`（最も新しい記録の日時。なければ `null`）、`currentRecordCount`（今の単語数と同じ単語数の記録の数。ベスト記録の比較に使う記録）は v0.50.0 からです（`GET /api/v1/lists/{l}` にもあります）。

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

### `GET /api/v1/lists/{l}`

単語を含む詳細です。

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

v1.3.0 から、記録は `typle_records` テーブルに保存されます。リストの記録がテーブルだけにあるときは、ワークスペース全体を読まずにテーブルから `since`・`limit` の分だけ読みます（答えは同じです）。`id` のない古い記録には、テーブルへ移すときに `legacy-` で始まる変わらない `id` が付きます。

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

### `GET /api/v1/dashboard`

アプリの「ホーム」の集計です（v0.53.0 から）。週は月曜はじまり、日の区切りは `tz`（`GET /api/v1/records` と同じ。省略するとサーバーのタイムゾーン）です。

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
- `trends`：記録のあるリストを最後に練習した順に並べます。`speed` は1単語あたりの秒数、`accuracy` は正確率の推移で、`points` は直近20回（古い順）、`change` は新しい半分（最大5回）とその前の同じ数との比較です（比べられなければ `null`）。`best` はそのリストのベストです（`GET /api/v1/rankings` の `best` と同じ）。
- 記録が1件もなくても、同じ形で返します（`weekCount` は `0`、`accuracy` は `null`、`trends` は `[]`）。

## 書き込み（`-writable` のとき）

本文は `Content-Type: application/json` のJSONオブジェクトで、1MiB までです（本文のない `DELETE` と複製を除く）。応答の `list` は `GET /api/v1/lists/{l}` と、`pack` は `GET /api/v1/packs/{p}` と同じ形です。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/lists` | `{ "name", "packId"?, "category"?, "tags"?, "levels"?, "words": [{ "display", "input", "annotation"? }] }` | `201 { "list" }`。IDはサーバーが UUID で決め、`createdAt` は今の時刻。最後に追加する。`packId` を省略するとリスト名で1リストのパックを作り、`category`・`tags` をそのパックに付ける。`packId` を指定するとそのパックの最後のリストになる（v0.95.0 から） |
| `PATCH /api/v1/lists/{l}` | `{ "name"?, "packId"?, "category"?, "tags"?, "levels"?, "words"? }`（少なくとも1つ） | `200 { "list" }`。`words`・`tags`・`levels` は全体を置き換える。`""` のカテゴリ・空の `tags`・空の `levels` で外す。`category`・`tags` はリストの入っているパック（`packId` を指定したら移した先）の値を変える。`packId` で別のパックに移すと、そのパックの最後のリストの後ろに入り、空になった元のパックは消える（v0.95.0 から）。記録・`createdAt`・並び順（移さないとき）は残る |
| `DELETE /api/v1/lists/{l}` | なし | `204`（本文なし）。記録も一緒に消える |
| `POST /api/v1/lists/{l}/copy` | なし、または `{ "name"? }` | `201 { "list" }`。元のリストと同じパックの最後に入る（v0.95.0 から。それまでは1リストの新しいパック）。単語をコピーし、難易度・記録はコピーしない。名前を省略すると「元の名前（コピー）」、同じパックで使われていれば「（コピー2）」…（200文字に収まるよう元の名前を切る）。名前は同じパックのリストと違えばよい（v0.47.0 から） |
| `POST /api/v1/lists/import?name=…&format=csv\|tsv&packId=…` | CSV・TSV のファイルそのもの（`Content-Type` は `text/csv`・`text/tab-separated-values`・`text/plain`。1MiB まで） | `201 { "list" }`。アプリの「CSV・TSVファイルから追加」と同じ読み方で単語を読み、`name` の名前のリストを作る（v0.48.0 から）。`packId` を指定するとそのパックの最後のリストになり、省略すると新しいパックを作る（v0.95.0 から） |
| `POST /api/v1/lists/{l}/records` | `{ "id"?, "time", "date", "mistakes", "accuracy", "wordCount"?, "deviceId"? \| "device"? }` | 追加したら `201 { "record" }`。同じリストに同じ `id` の記録があれば追加せず、保存済みの記録を `200 { "record" }` で返す |
| `POST /api/v1/devices` | `{ "name", "layout"? }` | `201 { "device" }`。IDはサーバーが UUID で決める。最後に追加する |
| `PATCH /api/v1/devices/{d}` | `{ "name"?, "layout"? }`（少なくとも一方） | `200 { "device" }` |
| `PATCH /api/v1/lists/{l}/records/{r}` | `{ "time"?, "date"?, "mistakes"?, "accuracy"?, "wordCount"?, "deviceId"? }`（少なくとも1つ） | `200 { "record" }`。送らなかった項目とTypleの知らない項目は残る。`id` は変えられない |
| `DELETE /api/v1/lists/{l}/records/{r}` | なし | `204`（本文なし） |
| `DELETE /api/v1/devices/{d}` | なし | `204`（本文なし） |
| `POST /api/v1/packs` | `{ "name", "description"?, "category"?, "tags"?, "lists": [{ "name", "levels"?, "words": [{ "display", "input", "annotation"? }] }] }`（リスト1つ以上） | `201 { "pack" }`。パック・リストのIDはサーバーが UUID で決め、`createdAt` は今の時刻。パックは最後に、リストはすべてのリストの後ろに追加する（v0.95.0 から） |
| `PATCH /api/v1/packs/{p}` | `{ "name"?, "description"?, "category"?, "tags"?, "listOrder"? }`（少なくとも1つ） | `200 { "pack" }`。`tags` は全体を置き換え、`""` の説明・カテゴリ・空の `tags` で外す。カテゴリ・タグは中のリストの値にもなる。`listOrder` は中のリストのIDを新しい順に並べたもの: パックにないIDは無視し、並べなかったリストは今の順で後ろに続く（v0.95.0 から） |
| `DELETE /api/v1/packs/{p}` | なし | `204`（本文なし）。中のリストと記録も一緒に消える（v0.95.0 から） |
| `POST /api/v1/packs/{p}/copy` | なし、または `{ "name"? }` | `201 { "pack" }`。元のパックの直後に入る。説明・カテゴリ・タグと、リストの名前・難易度・単語をコピーし、記録・`origin`（パックとリストの）はコピーしない。フォロー中の公式パックも複製でき、複製は自分のパックになる（v0.98.0 から）。名前を省略すると「元の名前（コピー）」、使われていれば「（コピー2）」…（v0.95.0 から） |
| `POST /api/v1/packs/import` | パックのファイルそのもの（`Content-Type: application/json`。1MiB まで） | `201 { "pack" }`。アプリの「ファイルから追加」と同じ読み方でパックを最後に追加する（下の「パックのファイルの取り込み」。v0.95.0 から） |

記録の追加は、アプリの練習画面（本番の `POST /api/workspace/records`）と同じ操作（`server/internal/operation` の `AddRecord`）です（v1.2.0 から）。revision を使わないため、別の画面でリストを編集していても拒否されず、同じ `id` の再送で記録が重複しません。ゲスト保存も同じ規則に従います（`tests/fixtures/records`）。端末は `deviceId`（追加する時点で登録されている端末として保存）か、`device`（`{ "id", "name", "layout" }`。練習した時点の端末としてそのまま保存。アプリはこちらを送ります）のどちらかで指定します（`device` は v1.2.0 から）。

### フォロー中の公式パック

アプリでフォローした公式パック（`origin.followed` が `true`）は、公式の内容のまま読み取り専用です（v0.98.0 から）。

- 変える書き込みは `409 packFollowed` で、何も保存しません: `PATCH /api/v1/packs/{p}`（`listOrder` も）、`POST /api/v1/lists`（`packId` がフォロー中のパック）、`PATCH /api/v1/lists/{l}`（フォロー中のパックのリスト、または `packId` でフォロー中のパックへ移すとき）、`DELETE /api/v1/lists/{l}`、`POST /api/v1/lists/{l}/copy`、`POST /api/v1/lists/import`（`packId` がフォロー中のパック）。ないパック・リストは今までどおり `404`・`400` です。
- できるもの: `DELETE /api/v1/packs/{p}`（フォロー解除。リストと記録も消える）、`POST /api/v1/packs/{p}/copy`（自分のパックになる）、記録の追加・変更・削除。
- 保存データを読むたびに、アプリと同じ変換をします。v0.98.0 より前に公式パックから追加したパック（`followed` のない `origin` のパックと、`origin` がなく ID が公式パックの `catalogId` と同じパック）はリスト・記録ごと除き、フォロー中のパックは説明・カテゴリ・タグとリスト（名前・難易度・単語・並び）を公式に揃えます。リストの記録は `origin.listId` が同じリストに残り、公式で増えたリストは `<パックの ID>:<公式のリストの ID>` の ID で加わり、公式からなくなったリストとカタログからなくなったパックは記録ごと除きます。変換の結果は次の書き込みで保存されます。

記録には練習したときの端末のコピーが入っているため、端末の名前を変えても削除しても、過去の記録の端末はそのままです（アプリと同じ）。組み込みの `default` は変更・削除できません（`404 deviceNotFound`）。

### リストの検証

アプリでリストを保存するときと同じです。

- `name`: 前後の空白を除いて1文字以上（`listNameRequired`）、ほかのリストと同じ名前は不可（前後の空白を除き、大文字小文字を区別しない。比べ方はアプリと同じJavaScriptの `toLowerCase` で、語末の `Σ` は `ς`、`İ` は `i̇` になる。`listNameDuplicate`）。前後の空白を除いて保存する。
- `words`: 1件以上（`wordsRequired`）。`display`・`input` は空白だけでない文字列（`wordFieldsRequired`）。`annotation` は省略すると `""`。単語の前後の空白はそのまま保存する。
- `category`・`tags`（v0.78.0 から。省略できる）: 前後の空白を除いて保存し、空のタグと、大文字小文字だけ違う同じタグは除く。空になれば保存しない。
- 長さ（UTF-16の文字数）: 名前200、単語1000件、`display`・`input` 1000、`annotation` 2000、カテゴリ50、タグ1つ50・20個まで、難易度50。超えると `invalidList`。NUL文字（`\u0000`）はDBに保存できないため、名前・単語・難易度のどこにあっても `invalidList`。
- リストが150件あるときの作成・複製は `listLimit`。
- `packId`（v0.95.0 から）: 名前はそのパックのほかのリストと違えばよい（`packId` を省略した作成ではすべてのリストと比べる）。ないパックは `400 packNotFound`。作成で `packId` と `category`・`tags` を一緒に送ると `invalidList`（パックの値を使うため）。リストと同じ名前の1リストだけのパックは、リストの名前を変えるとパックの名前も変わるため、そのリストをほかのパックと同じ名前にはできない（`listNameDuplicate`）。
- `levels`（v0.95.0 から）: 前後の空白を除いて保存し、空の難易度は除く。空になれば保存しない。1 つのリストの難易度は 1 つまでで、空を除いて 2 つ以上あると `tooManyLevels`（v0.97.0 から。例: `["基本", "初級"]`。それまでは 5 つまで。アプリの `PUT /api/workspace` は拒否せず、1 つにまとめて保存する）。練習画面は難易度（ないときはリスト名）でパックの中のリストを選ぶため、同じパックのほかのリストと同じになると選べないリストができるので `levelsConflict`（例: `["基本"]` と `["基本"]`、または難易度のない「基本」という名前のリスト）。

### パックの検証

アプリでパックを保存するときと同じです（v0.95.0 から）。

- `name`: 前後の空白を除いて1文字以上（`packNameRequired`）、ほかのパックと同じ名前は不可（比べ方はリスト名と同じ。`packNameDuplicate`）。前後の空白を除いて保存する。
- `description`: 前後の空白を除いて保存する。`category`・`tags`: リストと同じ規則で整える。
- 長さ（UTF-16の文字数）: 名前200、説明500、カテゴリ50、タグ1つ50・20個まで。超えるか NUL文字（`\u0000`）があると `invalidPack`。作成で `lists` がない・空のときも `invalidPack`。
- 作成の `lists` はそれぞれ「リストの検証」と同じ規則で、前のリストと比べて確かめる（名前の重なりは `listNameDuplicate`、難易度の重なりは `levelsConflict`、2 つ以上の難易度は `tooManyLevels`）。全体のリストが150件を超える作成・複製・取り込みは `listLimit`。

### パックのファイルの取り込み

アプリで「ファイルから追加」するときと同じです（v0.95.0 から）。

- 先頭の BOM は読み飛ばす。JSONでない、`format` が `typle-pack` でない、`version` が `1` でない、形が違う（`pack.name`・`lists`・各リストの `name`・`words`、各単語の `display`・`input`・`annotation` が文字列でないなど）、リストが1つもないファイルは `400 packFileUnreadable`。Typleの知らない項目は読み飛ばす。
- 中身は作成と同じ規則で確かめる（`packNameRequired`・`invalidPack`、リストの各キー、`listLimit`）。パック名がほかのパックと同じなら「名前（2）」「名前（3）」…にする。
- 難易度は拒否せずに直す（v0.96.3 から）: 2 つ以上の難易度（5 つまで）は、両端の空白と「・」を除き空を除いて「・」でつないだ 1 つにし（50 文字に収まるよう切り、切ったあとも両端の「・」と空白を除く。v0.97.0 から。例: `["基本", "初級"]` → `["基本・初級"]`）、リストどうしで同じになった難易度は後のリストに「（2）」…を付けて分ける（保存したデータを読み込むときと同じ）。以前に書き出したファイルや共有リンクも取り込めるようにするため。
- パック・リストのIDは新しく作り、作成日時は今の時刻、記録は空です。1MiB を超えると `413 importTooLarge`。

### CSV・TSV の取り込み

アプリで取り込むときと同じです。

- 1行目は見出しで、`input`・`display` が必須、`annotation` は任意（誤記の `anotation` も読む）。順番は問わない。
- `"` で囲んだ項目には区切り文字・改行・`""`（`"` 1文字）を入れられる。先頭の BOM と空行は読み飛ばす。単語の前後の空白・順序・重複はそのまま保存する。
- ファイルは UTF-8 で送る。Excel の既定の Shift_JIS など、UTF-8 として読めないファイルはアプリと同じく `400 importFileEncoding`（v0.53.1 から。それまでは読めない文字を � にして保存していた）。
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

- パックの共有リンク（`typle_shared_packs`、v0.96.0 から）は、書き込みでパックがなくなると（パックの削除、リストの移動で空になったパックを含む）、同じトランザクションで消えます。`/api/shares`・`/api/shared` は `/api/workspace` と同じアプリ自身のバックエンドで、`/api/v1` にはありません（[README の v0.96.0](../README.md#v0960--単語パックをリンクで共有できるようにしました)）。
- 関心（`typle_workspaces.interests`、v0.99.0 から）は `/api/workspace` だけが読み書きし、`/api/v1` には出さず、その書き込みでも変わりません。`PUT /api/workspace` の本文の `interests`（文字列の配列、50 個まで、1 つ 1〜50 文字、重複なし。違反は `400 invalidWorkspace`）は省略すると保存済みのまま、`GET` は未設定なら `[]` を返します。
- まだ一度も保存していないアカウントは、空のワークスペースに変更を加えて保存します（v0.98.0 から。それまでは最初の単語リスト）。読み取りでも、パック・リスト・端末は空です。
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

## コードの構成

モジュールはリポジトリ直下の `go.mod`、パッケージは `server/` の下です。`/api/v1` とアプリ自身のバックエンド（v0.55.0 から。GitHubログイン・`/api/workspace`・`/api/health`）が `internal/store`・`internal/workspace`・`internal/auth` を共有します。

| 場所 | 内容 |
|---|---|
| `server/cmd/typle-api` | この API（`/api/v1`）を起動するコマンド。本番には載せない |
| `server/cmd/typle-web` | アプリのバックエンドを手元で起動するコマンド（既定 `127.0.0.1:8081`）。`npm run dev` と E2E が使う |
| `server/internal/api` | `/api/v1` のHTTPハンドラー |
| `server/internal/auth` | GitHubのトークンからアカウントを確かめる（`/api/v1`）。アプリのログイン用の GitHub OAuth クライアントもここにある |
| `server/internal/store` | `typle_workspaces` の読み書き（`/api/v1` の行ロック方式と、アプリの `revision` による更新） |
| `server/internal/workspace` | 保存データの検証とリスト・記録・端末の変更 |
| `server/internal/web` | アプリのバックエンドのHTTPハンドラー（ログイン・`/api/workspace`・`/api/health`）。Cookie は `server/internal/session` で署名する |
| `server/vercel` | `internal/web` を Vercel の Go の関数（リポジトリ直下の `api/*.go`）から呼ぶ橋渡し |

## 開発

```sh
gofmt -l .
go vet ./...
TYPLE_TEST_DATABASE_URL=postgresql://typle:…@127.0.0.1:5432/typle go test ./...
```

DBのテスト（読み取りと書き込み）は、`npm run db:migrate` 済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定したときだけ実行します（ランダムなアカウントIDの行を作って、終わったら消します。本番のDBは指定しないでください）。CIの `verify` は `db:migrate` の後に同じ確認をします。公式パックの単語リスト（v0.98.0 より前は最初の単語リスト）は `src/plugins/packs` のコピーを `server/internal/workspace/packs` に埋め込んでいます。元を変えたら `go generate ./...` でコピーし直します（違うと `go test` が失敗します）。

## 範囲外

- GitHub 以外の認証、ブラウザーでのログイン画面、許可するユーザーの制限
- ローカルの開発用ログインのアカウント（`github:0`）。GitHub のトークンでは名乗れない
- `id` のない記録の変更・削除、記録の別のリストへの移動、パック・端末の並べ替え、単語単位の追加・削除（リストはパックの中で `listOrder` で並べ替えられる）
- 公式パックのフォロー（カタログからの追加）、リンクでの共有
- トークンごとの読み取り・書き込みの区別（書き込みはサーバーの `-writable` で決める）
- ブラウザー保存のデータ
