# 概要・起動・認証

GitHubでログインしたアカウントのクラウド保存（`typle_workspaces`）を、スクリプトや別のアプリから読み書きするためのAPIです。`server/` のGoサーバーで、Typle本体とは別に起動します。

::: warning 本番には載せていません
Vercel の本番にある Go の関数は、アプリ自身のバックエンド（`/api/auth/*`・`/api/workspace`・`/api/workspace/records`・`/api/shares`・`/api/shared`・`/api/admin/*`・`/api/health`）だけです。それは [アプリのAPI](/app/) にまとめています。
:::

- iPad 版は v0.56.0 から、Android 版は v0.57.0 から、この API を使いません。Windows 版（v0.59.0 から）と Mac 版（v0.60.0 から）も使いません。どれも Web版と同じ GitHub ログインで本番の `/api/workspace` を使います（[README の「iPad と Mac と Android と Windows のログイン」](https://github.com/Sparklingstadt/typle-r/blob/main/README.md#ipad-と-mac-と-android-と-windows-のログイン)）。
- 既定は読み取り専用です。`GET`・`HEAD` 以外は `405 methodNotAllowed` で、DBへの接続も読み取り専用（`default_transaction_read_only=on`）のため、書き込みはDBが拒否します。
- `-writable` を付けて起動すると、[書き込み](./write.md)もできます。リストの作成・変更・削除と記録の追加（v0.42.0 から）、リストの複製（v0.47.0 から）、CSV・TSV の取り込み（v0.48.0 から）、端末の作成・変更・削除（v0.44.0 から）、記録の変更・削除（v0.45.0 から）、パックの作成・変更・削除・複製・取り込み（v0.95.0 から）です。
- GitHubのトークンで認証します。読み書きできるのは、そのトークンのGitHubユーザー本人のアカウント（アプリにGitHubでログインしたときと同じ `github:<ユーザーID>`）のデータだけです。ほかのアカウントのデータには届きません。
- 形は v0.35.x までの `/api/v1` と同じです。共有リンクとプロファイルを削除したため `shared`・`shareUrl` と `/profiles/{p}` はありません。
- ブラウザー保存（ログインしていないとき）のデータはサーバーにないため扱えません。

## エンドポイントの一覧

| メソッドとパス | 内容 |
|---|---|
| [`GET /api/v1/devices`](./read.md#get-api-v1-devices) ・ [`POST`](./write.md) | 端末の一覧・作成 |
| [`GET /api/v1/devices/{d}`](./read.md#get-api-v1-devices-d) ・ `PATCH`・`DELETE` | 端末1台 |
| [`GET /api/v1/lists`](./read.md#get-api-v1-lists) ・ `POST` | リストの一覧・作成 |
| [`GET /api/v1/lists/{l}`](./read.md#get-api-v1-lists-l) ・ `PATCH`・`DELETE` | リスト1つ（単語を含む） |
| [`GET /api/v1/lists/{l}/words.csv`](./read.md#get-api-v1-lists-l-words-csv) | 単語の CSV |
| `POST /api/v1/lists/{l}/copy` | リストの複製 |
| `POST /api/v1/lists/import` | CSV・TSV からリストを作る |
| [`GET /api/v1/lists/{l}/records`](./read.md#get-api-v1-lists-l-records) ・ `POST` | リストの記録の一覧・追加 |
| [`GET /api/v1/lists/{l}/records/{r}`](./read.md#get-api-v1-lists-l-records-r) ・ `PATCH`・`DELETE` | 記録1件 |
| [`GET /api/v1/packs`](./read.md#get-api-v1-packs) ・ `POST` | パックの一覧・作成 |
| [`GET /api/v1/packs/{p}`](./read.md#get-api-v1-packs-p) ・ `PATCH`・`DELETE` | パック1つ（リストを含む） |
| [`GET /api/v1/packs/{p}/export`](./read.md#get-api-v1-packs-p-export) | パックのファイル |
| `POST /api/v1/packs/{p}/copy` | パックの複製 |
| `POST /api/v1/packs/import` | パックのファイルを取り込む |
| [`GET /api/v1/records`](./read.md#get-api-v1-records) | すべてのリストの記録 |
| [`GET /api/v1/rankings`](./read.md#get-api-v1-rankings) | リストごとのベスト記録 |
| [`GET /api/v1/rankings/{l}`](./read.md#get-api-v1-rankings-l) | 1つのリストの順位 |
| [`GET /api/v1/dashboard`](./read.md#get-api-v1-dashboard) | ホームの集計 |

書き込み（`POST`・`PATCH`・`DELETE`）は `-writable` のときだけで、本文と応答は [書き込み](./write.md) にまとめています。

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
- まだ一度も保存していないアカウント（行がない）は、パック・リスト・端末が空です（v0.98.0 から）。
- `sslmode=prefer`・`require`・`verify-ca` は、アプリと同じく `verify-full` として接続し、サーバー証明書を検証します（`uselibpqcompat=true` のときはそのまま）。`sslmode` のない URL も、接続先がこの機械（`localhost`・`127.0.0.0/8`・`::1`・Unix ソケット）でなければ `verify-full` にします。Neonの `channel_binding=require` も使えます。
- 検証はアプリの読み込みと同じです（任意の項目の `null` だけは、省略と同じに扱います）。保存データが読めないときは `503 databaseUnavailable` を返し、理由をログに出します。
- 以前の共有の項目（`shared`・`shareId`）は読み込み時に捨てます。ほかの知らない項目（リスト・単語・記録・記録の端末）は、アプリと同じく残し、書き込みでも消しません。
- 記録の日時は `toISOString` の形（`2026-10-10T02:00:00.000Z`）と、`2024/09/22 10:05` のような形を読みます。時差のない日時はサーバーのタイムゾーンで解釈するため、ブラウザーと違う場合は `TZ=Asia/Tokyo` などを指定します。

::: danger ほかの端末から使うとき
既定では `127.0.0.1` だけで待ち受けます。ほかの端末から使う場合は、トークンが平文で流れないよう、HTTPSのリバースプロキシの後ろに置いてください。
:::

## 認証

すべてのリクエストに `Authorization: Bearer <GitHubのFine-grainedの個人用アクセストークン>` を付けます。

```sh
export TYPLE_TOKEN="github_pat_…"   # GitHub の Fine-grained の個人用アクセストークン
curl -H "Authorization: Bearer $TYPLE_TOKEN" http://127.0.0.1:8080/api/v1/lists
```

- サーバーはトークンで GitHub の `GET /user` を呼び、返ったユーザーIDのアカウントを読みます。サーバー側に秘密値や OAuth App の設定は要りません。
- 受け付けるのは `github_pat_` で始まる Fine-grained の個人用アクセストークンだけです（v0.54.0 から）。`gh auth token` の値（`gho_`）、ほかのサービスが GitHub 連携で持つトークン（`gho_`・`ghu_` など）、classic の個人用アクセストークン（`ghp_`）は、GitHub に問い合わせずに `401 invalidToken` で断ります。利用者がほかのサービスに渡したトークンで、そのサービスが Typle のデータを読み書きできないようにするためです。
- 確認できたトークンは5分間覚えておき、その間は GitHub に問い合わせません。そのため、失効したトークンも最大5分は使えます。メモリーに残すのはトークンのSHA-256だけです。GitHub が受け付けなかったトークンは覚えません。
- ヘッダーがない、形式が違う（`Bearer` 以外、空白を含むなど）、Fine-grained でない、GitHub が受け付けないトークンは、すべて `401 invalidToken` で、`WWW-Authenticate: Bearer` を付けます。
- GitHub に届かない、レート制限（403・429）、GitHub の障害のときは `503 githubUnavailable` です。トークンが悪いとは限らないので、しばらくしてからやり直します。
- 覚えていないトークンを GitHub に問い合わせるのは、まとめて20回、その後は1秒に10回までです。でたらめなトークンを大量に送られても、サーバーから GitHub へ大量に問い合わせません。超えた分も `503 githubUnavailable` です。覚えているトークンは制限されません。
- 未知のパス（`404 notFound`）と、そのパスで使えないメソッド（`405`）は、認証より先に返します。書き込みの本文は認証の後で読みます。
- `-writable` のときは、GitHub で本人と確かめられたトークンなら書き込めます。トークンの権限（スコープ）では区別しません。書き込みを許したくないときは `-writable` を付けずに起動してください。

::: tip トークンの作り方
GitHub の Settings → Developer settings → Fine-grained tokens で、リポジトリへのアクセスなし（Public repositories）・権限なしで作り、有効期限も付けてください。トークンはユーザーを確かめるためだけに使います。Typle 専用に作り、ほかの用途と使い回さないでください。
:::
