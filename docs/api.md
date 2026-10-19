# 読み取り専用API（Go）

ブラウザーに保存したワークスペース（単語リスト・練習記録・端末）を、スクリプトや別のアプリから読むためのAPIです。`server/` のGoサーバー（標準ライブラリだけ）で、Typle本体とは別に起動します。Vercelの本番には載せていません。

- 読み取りだけです。`GET`・`HEAD` 以外は `405 methodNotAllowed` です。
- **認証はまだありません。** サーバーに届く人は誰でもワークスペース全体を読めます。既定では `127.0.0.1` だけで待ち受けます。ほかの端末に公開する場合は、信頼できるネットワークの中だけにしてください。
- 形は v0.35.x までの `/api/v1` の読み取りと同じです。共有リンクを削除したため `shared`・`shareUrl` はありません。

## 起動

Go 1.24以上が必要です。

1. Typleを開いたブラウザーの開発者ツールのコンソールで、保存データをコピーします。

   ```js
   copy(localStorage.getItem('typle-r:guest-workspace:v1'))
   ```

2. 貼り付けてファイルに保存し、サーバーを起動します。個人のデータなので、リポジトリの外（例: `~/typle-workspace.json`）に置きます。

   ```sh
   cd server
   go run ./cmd/typle-api -data ~/typle-workspace.json
   ```

| フラグ | 既定 | 内容 |
|---|---|---|
| `-addr` | `127.0.0.1:8080` | 待ち受けるアドレス |
| `-data` | なし | ワークスペースのJSON。省略すると、まだ何も保存していないときと同じ最初の単語リスト（サンプルと国名193か国）を返す |

- データは起動時に1回だけ読みます。ブラウザーで変更したら、コピーし直してサーバーを再起動します。
- ファイルは保存データそのまま（`{ version: 1, accountId: 'guest:local', revision, lists, devices }`）のほか、`{ version: 1, lists, devices }` も読めます。`devices` は省略できます。`revision` が `0`（まだ保存していない）なら、アプリと同じく最初の単語リストを返します。
- 検証はアプリの読み込みと同じです（任意の項目の `null` だけは、省略と同じに扱います）。アプリが読めないデータ、10MiBを超えるファイル、プロファイル（v0.34.0で廃止）が残ったデータでは起動しません。プロファイルはアプリを一度開くと統合されるので、その後にコピーし直します。
- 以前の共有の項目（`shared`・`shareId`）は読み込み時に捨てます。
- 記録の日時は `toISOString` の形（`2026-10-10T02:00:00.000Z`）と、`2024/09/22 10:05` のような形を読みます。時差のない日時はサーバーのタイムゾーンで解釈するため、ブラウザーと違う場合は `TZ=Asia/Tokyo` などを指定します。

## 共通事項

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）、`Cache-Control: no-store` です。
- CORSヘッダーは付けないため、ブラウザーの他サイトからは呼べません。サーバーやスクリプトから利用してください。
- エラーは `{ "error": "<キー>" }` です。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidQuery` | `since`・`limit` が不正 |
| 404 | `listNotFound` | 指定したIDのリストがない |
| 404 | `notFound` | 未知のパス |
| 405 | `methodNotAllowed` | `GET`・`HEAD` 以外。`Allow: GET, HEAD` を付ける |

## エンドポイント

### `GET /api/v1/devices`

登録した練習端末の一覧です。組み込みの「デフォルト」は含みません（記録の `device.id` は `default` になります）。

```json
{ "devices": [{ "id": "d1", "name": "自宅のキーボード", "layout": "JIS" }] }
```

### `GET /api/v1/lists`

リストの一覧（保存順）です。単語は含みません。

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

記録は保存されている形のまま返します。古い記録には `id`・`mistakes`・`accuracy`・`wordCount`・`device` がないことがあります。

## 例

```sh
curl http://127.0.0.1:8080/api/v1/lists
curl "http://127.0.0.1:8080/api/v1/lists/$LIST_ID/records?since=2026-10-01T00:00:00Z&limit=20"
```

## 開発

```sh
cd server
gofmt -l .
go vet ./...
go test ./...
```

CIの `verify` も同じ確認をします。最初の単語リストは `src/plugins/packs` のコピーを `server/internal/workspace/packs` に埋め込んでいます。元を変えたら `go generate ./...` でコピーし直します（違うと `go test` が失敗します）。

## 範囲外

- 認証（トークンなど）
- 書き込み（リスト・記録・端末の作成・変更・削除）
- 起動中のデータの再読み込み
- ブラウザーとの自動同期
