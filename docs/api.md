# 読み取り専用API（Go）

GitHubでログインしたアカウントのクラウド保存（`typle_workspaces`）を、スクリプトや別のアプリから読むためのAPIです。`server/` のGoサーバーで、Typle本体とは別に起動します。Vercelの本番には載せていません。

- 読み取りだけです。`GET`・`HEAD` 以外は `405 methodNotAllowed` です。DBへの接続も読み取り専用（`default_transaction_read_only=on`）で、書き込みはDBが拒否します。
- GitHubのトークンで認証します。返すのは、そのトークンのGitHubユーザー本人のアカウント（アプリにGitHubでログインしたときと同じ `github:<ユーザーID>`）のデータだけです。ほかのアカウントのデータには届きません。
- 形は v0.35.x までの `/api/v1` の読み取りと同じです。共有リンクを削除したため `shared`・`shareUrl` はありません。
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

- 起動時にDBへ接続を確かめ、できなければ終了します。
- データはリクエストごとにDBから読みます。アプリで保存した変更は次のリクエストから見えます。
- 既定では `127.0.0.1` だけで待ち受けます。ほかの端末から使う場合は、トークンが平文で流れないよう、HTTPSのリバースプロキシの後ろに置いてください。
- まだ一度も保存していないアカウント（行がない）は、アプリと同じく最初の単語リスト（サンプルと国名193か国）を返します。
- `sslmode=prefer`・`require`・`verify-ca` は、アプリと同じく `verify-full` として接続し、サーバー証明書を検証します（`uselibpqcompat=true` のときはそのまま）。Neonの `channel_binding=require` も使えます。
- 検証はアプリの読み込みと同じです（任意の項目の `null` だけは、省略と同じに扱います）。保存データが読めないときは `503 databaseUnavailable` を返し、理由をログに出します。
- 以前の共有の項目（`shared`・`shareId`）は読み込み時に捨てます。
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
- 未知のパス（`404 notFound`）と `GET`・`HEAD` 以外（`405`）は、認証より先に返します。

## 共通事項

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）、`Cache-Control: no-store` です。
- CORSヘッダーは付けないため、ブラウザーの他サイトからは呼べません。サーバーやスクリプトから利用してください。
- エラーは `{ "error": "<キー>" }` です。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `invalidQuery` | `since`・`limit` が不正 |
| 401 | `invalidToken` | トークンがない、形式が違う、または GitHub が受け付けない |
| 404 | `listNotFound` | 指定したIDのリストがない |
| 404 | `notFound` | 未知のパス |
| 405 | `methodNotAllowed` | `GET`・`HEAD` 以外。`Allow: GET, HEAD` を付ける |
| 503 | `githubUnavailable` | GitHub でトークンを確かめられない。しばらくしてからやり直す |
| 503 | `databaseUnavailable` | DBの障害、または保存済みのデータが読めない。しばらくしてからやり直す |

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
curl -H "Authorization: Bearer $TYPLE_TOKEN" http://127.0.0.1:8080/api/v1/lists
curl -H "Authorization: Bearer $TYPLE_TOKEN" \
  "http://127.0.0.1:8080/api/v1/lists/$LIST_ID/records?since=2026-10-01T00:00:00Z&limit=20"
```

## 開発

```sh
cd server
gofmt -l .
go vet ./...
TYPLE_TEST_DATABASE_URL=postgresql://typle:…@127.0.0.1:5432/typle go test ./...
```

DBのテストは、`npm run db:migrate` 済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定したときだけ実行します（ランダムなアカウントIDの行を作って、終わったら消します。本番のDBは指定しないでください）。CIの `verify` は `db:migrate` の後に同じ確認をします。最初の単語リストは `src/plugins/packs` のコピーを `server/internal/workspace/packs` に埋め込んでいます。元を変えたら `go generate ./...` でコピーし直します（違うと `go test` が失敗します）。

## 範囲外

- GitHub 以外の認証、ブラウザーでのログイン画面、許可するユーザーの制限
- ローカルの開発用ログインのアカウント（`github:0`）。GitHub のトークンでは名乗れない
- 書き込み（リスト・記録・端末の作成・変更・削除）
- ブラウザー保存のデータ
