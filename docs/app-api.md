# アプリのAPI（`/api/*`）

Typle 本体（Web版と iPad・Mac・Android・Windows 版）が使う、アプリ自身のバックエンドです。Go の `server/internal/web` で、本番では Vercel の Go の関数（リポジトリ直下の `api/*.go` → `server/vercel`）として動きます。手元では `server/cmd/typle-web`（既定 `127.0.0.1:8081`）で起動し、`npm run dev` と E2E が使います。

Web版は v2.2.0 から、ワークスペース・練習記録・共有・共有リンク・管理者ダッシュボードを `POST /api/graphql` で読み書きします（[GraphQL API](graphql.md)）。各フィールドはこの文書の REST のパスと同じ処理とエラーのキーを使い、REST のパスはほかのアプリのために残しています。

スクリプトや別のアプリから読み書きする手元専用の `/api/v1` は [API（Go）](api.md) を見てください。2つは `internal/store`・`internal/workspace`・`internal/auth` を共有します。

## 共通事項

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）で、`Cache-Control: private, no-store`・`Vary: Cookie` を付けます。`/api/shared` だけは `Cache-Control: no-store` です。
- エラーは `{ "error": "<キー>" }` です。キーはアプリの `errors` のメッセージのキーで、画面が利用者の言語で表示します。
- すべての応答に `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`・`X-Frame-Options: DENY`・`X-Content-Type-Options: nosniff`・`Referrer-Policy: strict-origin-when-cross-origin` を付けます（Vercel では `next.config.mjs` のヘッダーが Go の関数に届かないため）。
- `HEAD` は `GET` と同じに答えます（本文なし）。

| ステータス | キー | 状況 |
|---|---|---|
| 400 | `emptyRequest` | 書き込みに本文がない |
| 400 | `invalidWorkspace`・`invalidRecord`・`levelsConflict`・`listLimit` など | 本文が不正（各エンドポイントを参照） |
| 401 | `loginRequired` | ログインしていない、またはセッションが無効にされた |
| 401 | `loginAccountChanged` | 本文の `accountId` がログイン中のアカウントと違う（別の画面で別のアカウントにログインした） |
| 403 | `forbiddenRequest` | 書き込みの `Origin` がアプリのものでない、または `Content-Type` が `application/json` でない |
| 404 | `notFound` | 未知のパス |
| 405 | `methodNotAllowed` | そのパスで使えないメソッド。`Allow` に使えるメソッドを付ける |
| 409 | `conflict` | 保存の `revision` が古い |
| 413 | `workspaceTooLarge` | 本文が 1MiB を超える、または保存後が大きすぎる |
| 503 | `databaseUnavailable` | DBの障害（読み取り） |
| 503 | `workspaceSaveFailed` | DBの障害（書き込み） |
| 503 | `authUnavailable` | ログインの設定がない、またはログインを始められない |

503 で答えた失敗は、操作名（`workspace.read` など）を付けて Sentry に送ります（[sentry.md](sentry.md)）。

## 認証

アカウントは `github:<GitHubのユーザーID>`、または FFPF ID でログインしたときのアカウントです。

- `Authorization` ヘッダーがあるリクエストは、アプリ（iPad・Mac・Android・Windows）のものとして `Authorization: Bearer <トークン>` だけで判断し、Cookie は見ません。トークンは `POST /api/auth/token` で受け取ります。
- ないリクエストはセッションの Cookie で判断します。名前は HTTPS では `__Host-` 付きで、`HttpOnly`・`SameSite=Lax`・`Path=/` です。セッションはログインから30日で切れ、使っても延びません。
- データを読み書きするリクエストは、そのたびにセッションが無効にされていないか（`POST /api/auth/signout?everywhere=1` の後のログインか）をDBで確かめます。無効なら `401 loginRequired` で、Cookie を消します。確かめられなければ `503 databaseUnavailable` です。

### 書き込みの制限（CSRF 対策）

Cookie で書き込むリクエストは、`Origin` がアプリの origin（`AUTH_URL`。小文字、既定のポートなし）と同じで、`Content-Type` の `;` より前が `application/json` のときだけ受け付けます。違えば `403 forbiddenRequest` です。ほかのサイトのフォームはこの `Content-Type` を送れないため、他サイトから Cookie で保存されることはありません。アプリのトークンはブラウザーが勝手に送らないため、トークンのリクエストに `Origin` は要りません（`Content-Type` は要ります）。

## エンドポイント

| メソッドとパス | ログイン | 内容 |
|---|---|---|
| `GET /api/health` | 不要 | DB に5秒以内につながれば `200 { "status": "ok" }`、だめなら `503 databaseUnavailable` |
| `GET /api/workspace` | 要 | ワークスペース全体 |
| `PUT /api/workspace` | 要 | ワークスペースを保存する |
| `POST /api/workspace/records` | 要 | 記録を1件追加する |
| `DELETE /api/workspace/records` | 要 | 記録を1件削除する |
| `GET /api/shares` | 要 | 共有中のパックの一覧 |
| `PUT /api/shares` | 要 | パックを共有する（共有中なら中身を取り直す） |
| `DELETE /api/shares?pack=<パックのID>` | 要 | 共有をやめる |
| `GET /api/shared?id=<共有のID>` | 不要 | 共有されたパックのファイル |
| `GET /api/auth/session` | 任意 | ログイン中のユーザーと、使えるログイン方法 |
| `GET /api/auth/signin` | — | ログインを始める |
| `GET /api/auth/callback/github`・`/api/auth/callback/ffpf` | — | ログインから戻る先 |
| `POST /api/auth/token` | — | アプリのログインのコードをトークンに換える |
| `POST /api/auth/signout` | — | ログアウト |
| `POST /api/auth/local` | — | 開発用のログイン（有効なときだけ） |
| `POST /api/auth/admin/signout` | — | 管理画面からログアウト |
| `GET /api/admin/dashboard` | 管理者 | 管理画面の集計 |
| `GET /api/admin/users` | 管理者 | ユーザーの一覧 |

### `GET /api/workspace`

```json
{
  "lists": [ … ],
  "packs": [ … ],
  "devices": [ … ],
  "interests": ["language", "programming/go"],
  "revision": 12,
  "accountId": "github:123"
}
```

- `lists`・`packs`・`devices`・`interests` は保存されている jsonb をそのまま返します（Typleの知らない項目も含む）。Go は読み込めるか確かめるだけで、形が合わないデータは画面が `savedDataCorrupted` として扱います。
- `packs` はパックができる前に保存したアカウントと、一度も保存していないアカウントでは `null` です。
- `interests` は保存していなければ、すべての選択肢（`DEFAULT_INTERESTS`。`tests/fixtures/default-interests.json`）です。
- 一度も保存していないアカウントは、`lists`・`devices` が `[]`、`revision` が `0` です。

### `PUT /api/workspace`

本文はJSONのオブジェクトで、1MiB までです。応答は `GET` と同じ形の保存後のワークスペースです。

| 項目 | 内容 |
|---|---|
| `accountId` | 必須。ログイン中のアカウントと違えば、ほかより先に `401 loginAccountChanged` |
| `revision` | 必須。読み込んだときの `revision`（0以上の整数。`Number.isSafeInteger` の範囲）。保存のたびに1増える。保存済みと違えば `409 conflict` で、画面は読み込み直す。`0` は行を作る |
| `lists` | 省略すると保存済みのまま |
| `packs` | `lists` と一緒のときだけ。`lists` だけ送ると、各リストを1リストのパックに入れる |
| `devices` | 省略すると保存済みのまま |
| `interests` | 文字列の配列（50個まで、1つ1〜50文字、重複なし）。省略すると保存済みのまま。`null` はなし |

- `lists`・`packs`・`devices` の `null`、`packs` だけの本文、パックより前の形（`profileId`・`profiles`）は `400 invalidWorkspace` です。
- PostgreSQL の jsonb に保存できない文字（`\u0000`、対になっていないサロゲート）は、知らない項目にあっても `400 invalidWorkspace` です。
- 同じパックのリストで難易度が重なると `400 levelsConflict`、リストが多すぎると `400 listLimit`、ほかの検証の誤りは `400 invalidWorkspace` です。1つのリストに2つ以上の難易度があっても拒否せず、1つにまとめて保存します。
- 検証の規則は `/api/v1` と同じです（[API（Go）の「リストの検証」](api.md#リストの検証)）。

### `POST /api/workspace/records`・`DELETE /api/workspace/records`

練習画面の記録の追加と、記録画面の削除です（v1.2.0・v1.4.0 から）。`/api/v1` と同じ操作（`server/internal/operation` の `AddRecord`・`DeleteRecord`）で、`revision` を使わないため、別の画面でリストを編集していても拒否されません。同じ本文で送り直しても結果は同じです。

| メソッド | 本文 | 応答 |
|---|---|---|
| `POST` | `{ "accountId", "listId", "record": { "id", "time", "date", "mistakes", "accuracy", "wordCount"?, "deviceId"? \| "device"? } }` | 追加したら `201`、同じリストに同じ `id` があれば追加せず `200`。どちらも保存後のワークスペースに `record` を足したもの |
| `DELETE` | `{ "accountId", "listId", "recordId" }` | `200` と保存後のワークスペース。記録やリストがすでになくても `200` |

- 本文のほかの項目と、`record` の知らない項目は `400 invalidRecord` です。`record.id` は必須です。
- 追加先のリストがなければ `404 recordListDeleted`、記録の検証の誤りは `400` と検証のキー（[API（Go）の「記録の検証」](api.md#記録の検証)）です。
- 本文・応答・エラーコードは [workspace-records.openapi.json](api/workspace-records.openapi.json)（OpenAPI 3.1）に定義し、Go のハンドラとアプリの両方をテストでこの定義と照合しています（v1.6.0 から）。

### `/api/shares`・`/api/shared`

単語パックをリンクで共有します（v0.96.0 から）。共有するとパックをその時点のファイルにコピーし、リンクを開いた人はそのコピーを読みます。リンクの URL は画面がサイトの origin と `id` から作るため、応答には含みません。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `GET /api/shares` | なし | `200 { "shares": [{ "id", "packId", "name", "updatedAt" }] }`（新しく更新した順） |
| `PUT /api/shares` | `{ "packId" }`（ほかの項目はなし。4KiB まで） | `200 { "id", "packId", "name", "updatedAt" }`。共有中のパックは同じ `id` のまま中身を取り直す。ないパックは `404 packNotFound`、本文が不正なら `400 invalidWorkspace` |
| `DELETE /api/shares?pack=<パックのID>` | なし（`Content-Type` は見ない。`Origin` は見る） | `204`。共有していないパックも `204`。`pack` がなければ `400 invalidWorkspace` |
| `GET /api/shared?id=<共有のID>` | なし | `200` とパックのファイル（`typle-pack` 形式。[API（Go）の `GET /api/v1/packs/{p}/export`](api.md#get-apiv1packspexport) と同じ形）。持ち主の情報は含まない。ない共有・UUID でない `id` は `404 sharedPackNotFound` |

- `/api/shared` はログイン不要で、すべての応答（エラーも）に `X-Robots-Tag: noindex` を付けます。共有をやめたら直ちに読めなくなるよう、キャッシュさせません。
- パックを削除する保存（リストの移動で空になったパックを含む）は、同じトランザクションでその共有も消します。

## ログイン

ログインは GitHub（OAuth App）か FFPF ID（OpenID Connect）で、どちらも PKCE（S256）を使います。

### `GET /api/auth/signin`

| クエリ | 内容 |
|---|---|
| `provider` | `github`（既定）か `ffpf` |
| `returnTo` | ログイン後に戻るアプリ内のパス（既定 `/home`）。サイト内のパスでなければ既定にする |
| `client`・`code_challenge` | アプリのログイン。`client` は `ipad`・`macos`・`android`・`windows`、`code_challenge` はアプリが作った S256 のチャレンジ（43文字） |
| `admin=1` | 管理画面のログイン。`provider` によらず FFPF ID を通り、必ず `/admin` に戻る |

ログインの途中の状態（state・verifier・戻り先など）を署名した Cookie `typle-oauth`（`Path=/api/auth`、10分）に入れ、GitHub か FFPF ID へリダイレクトします。そのログイン方法の設定がなければ `503 authUnavailable` です。

### `GET /api/auth/callback/github`・`/api/auth/callback/ffpf`

`typle-oauth` の Cookie を必ず消し、state が合い、ログイン先がアカウントを確かめたときだけログインして、`returnTo` へリダイレクトします。失敗しても理由は見せずに `returnTo` へ戻ります。

- Web版：セッションの Cookie を発行します。
- アプリ：Cookie は発行せず、`typle-r://login?code=<コード>`（失敗は `typle-r://login?error=loginFailed`）へ戻ります。コードは2分で切れます。
- 管理画面：`typle_admins` に登録されたアカウントなら管理者の Cookie を発行して `/admin` へ、そうでなければ `/admin?error=adminForbidden`、DB に聞けなければ `/admin?error=adminUnavailable` へ戻ります。アプリにはログインしません。

### `POST /api/auth/token`

アプリがログインの最後に、コードと自分の verifier をトークンに換えます。Cookie を使わないため `Origin` は要りません。

```json
// 本文（4KiB まで）
{ "code": "…", "verifier": "…" }
// 応答
{ "token": "…", "user": { "id": "github:123", "name": "…", "image": "https://…" } }
```

コードが切れている、verifier がチャレンジと合わないなど、どんな誤りも `400 loginFailed` で、アプリはログインをやり直します。トークンはセッションと同じく30日で切れます。

### `GET /api/auth/session`

```json
{ "user": { "id": "github:123", "name": "…", "image": null }, "providers": ["github", "ffpf"] }
```

- ログインしていなければ `user` は `null` です。`providers` は設定のあるログイン方法を `github`・`ffpf` の順に並べます。
- 無効にされたセッションは `user: null` で、Cookie を消します。この応答は DB を待たないため、すぐ確かめられないときは確かめずに答えます（データの読み書きは `signedIn` で必ず確かめます）。

### `POST /api/auth/signout`

`204` で、セッションの Cookie を消します。アプリの `Origin` が必要です。

`?everywhere=1` を付けると、このアカウントのそれまでのすべてのログイン（Cookie もアプリのトークンも）を無効にします。盗まれたセッションを期限前に止める唯一の方法です。アプリはトークンで、`Origin` なしで呼べます。すでに無効にされたセッションからは `401 loginRequired`、DB に読み書きできなければ `503 databaseUnavailable`（Cookie は残すのでやり直せます）です。

### `POST /api/auth/local`

開発用に `github:0`（「ローカル練習用」）としてログインし、`204` を返します。手元の `typle-web` で、`LOCAL_DEVELOPMENT_LOGIN=1` かつ `AUTH_URL` がこの機械への `http`（またはそれと同じ `LOCAL_DEVELOPMENT_LAN_HOST` のプライベートIPv4）のときだけあり（`server/internal/web/config.go` の `localLoginAllowed`）、本番を含むほかでは `404 notFound` です。アプリの `Origin` が必要です。

## 管理画面

`/admin` は FFPF ID でだけログインでき（`/api/auth/signin?admin=1`）、`typle_admins` にメールアドレスで登録されたアカウントだけが入れます。最初のログインでそのアカウントの `sub` を行に結び付けるため、後でそのメールアドレスを取った別人は入れません。

- 管理者の Cookie は `HttpOnly`・`SameSite=Strict` で、12時間で切れます（延びません）。セッションの Cookie とは別です。
- `/api/admin/*` は毎回 `typle_admins` を確かめます。Cookie がなければ `401 adminRequired`、登録が消えていれば Cookie を消して `403 adminForbidden` です。

### `GET /api/admin/dashboard`

```json
{
  "admin": { "email": "admin@example.com", "sub": "…" },
  "overview": {
    "workspaces": 120, "activeDay": 8, "activeWeek": 30, "activeMonth": 64, "sharedPacks": 15,
    "recentShares": [{ "id": "…", "ownerId": "github:123", "name": "Linux", "updatedAt": "…" }],
    "admins": [{ "email": "admin@example.com", "ffpfSub": "…", "createdAt": "…", "lastSeenAt": "…" }]
  }
}
```

`workspaces` は保存したアカウントの数、`activeDay`・`activeWeek`・`activeMonth` はそれぞれ1日・7日・30日以内に保存したアカウントの数です。`recentShares` は新しく更新した共有20件です。すべて1つの読み取り専用トランザクションで読みます。

### `GET /api/admin/users?page=<0から>`

```json
{ "page": 0, "pageSize": 50, "total": 120, "users": [{ "ownerId": "github:123", "lists": 12, "packs": 4, "devices": 2, "shares": 1, "revision": 40, "updatedAt": "…" }] }
```

新しく保存した順に50件ずつです。データの中身ではなく、件数だけを返します。`page` が0〜10000の整数でなければ `400 invalidPage` です。

### `POST /api/auth/admin/signout`

管理者の Cookie を消して `204` を返します。アプリの `Origin` が必要です。

## コードの構成

| 場所 | 内容 |
|---|---|
| `api/**/*.go` | Vercel の Go の関数。パスごとに1つで、すべて `server/vercel` の同じハンドラーを呼ぶ |
| `server/vercel` | 環境変数から `internal/web` を組み立てる。`/api/auth` はセッションの応答が DB を待たないよう、DB を開かずに組み立てる |
| `server/cmd/typle-web` | 手元でこの API を起動するコマンド |
| `server/internal/web` | HTTPハンドラー（`web.go` がパスの一覧） |
| `server/internal/session` | Cookie・トークン・ログイン途中の状態の署名 |
| `server/internal/auth` | GitHub の OAuth と FFPF ID のクライアント |
| `server/internal/store` | `typle_workspaces`・`typle_records`・`typle_shared_packs`・`typle_admins` などの読み書き |
| `server/internal/operation` | 記録の追加・変更・削除（`/api/v1` と共通） |
