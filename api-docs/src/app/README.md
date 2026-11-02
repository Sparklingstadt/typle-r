# 概要と共通事項

Typle 本体（Web版と iPad・Mac・Android・Windows 版）が使う、アプリ自身のバックエンドです。Go の `server/internal/web` で、本番では Vercel の Go の関数（リポジトリ直下の `api/index.go` → `server/vercel`）として動きます。手元では `server/cmd/typle-web`（既定 `127.0.0.1:8081`）で起動し、`npm run dev` と E2E が使います。

スクリプトや別のアプリから読み書きする手元専用の `/api/v1` は [API（Go）](/v1/) を見てください。2つは `internal/store`・`internal/workspace`・`internal/auth` を共有します。

## エンドポイント

| メソッドとパス | ログイン | 内容 |
|---|---|---|
| `GET /api/health` | 不要 | DB に5秒以内につながれば `200 { "status": "ok" }`、だめなら `503 databaseUnavailable` |
| [`GET /api/workspace`](./workspace.md#get-api-workspace) | 要 | ワークスペース全体 |
| [`PUT /api/workspace`](./workspace.md#put-api-workspace) | 要 | ワークスペースを保存する |
| [`POST /api/workspace/records`](./workspace.md#記録の追加と削除) | 要 | 記録を1件追加する |
| [`DELETE /api/workspace/records`](./workspace.md#記録の追加と削除) | 要 | 記録を1件削除する |
| [`GET /api/shares`](./shares.md) | 要 | 共有中のパックの一覧 |
| [`PUT /api/shares`](./shares.md) | 要 | パックを共有する（共有中なら中身を取り直す） |
| [`DELETE /api/shares?pack=<パックのID>`](./shares.md) | 要 | 共有をやめる |
| [`GET /api/shared?id=<共有のID>`](./shares.md) | 不要 | 共有されたパックのファイル |
| [`GET /api/gallery`](./shares.md#ギャラリー) | 不要 | ギャラリーのパックの検索 |
| [`GET /api/gallery/categories`](./shares.md#ギャラリー) | 不要 | ギャラリーのカテゴリーと件数 |
| [`POST /api/gallery/added?id=<共有のID>`](./shares.md#ギャラリー) | 不要 | ギャラリーのパックが追加されたことを数える |
| [`GET /api/auth/session`](./auth.md#get-api-auth-session) | 任意 | ログイン中のユーザーと、使えるログイン方法 |
| [`GET /api/auth/signin`](./auth.md#get-api-auth-signin) | — | ログインを始める |
| [`GET /api/auth/callback/github`・`/api/auth/callback/ffpf`](./auth.md#ログインから戻る先) | — | ログインから戻る先 |
| [`POST /api/auth/token`](./auth.md#post-api-auth-token) | — | アプリのログインのコードをトークンに換える |
| [`POST /api/auth/signout`](./auth.md#post-api-auth-signout) | — | ログアウト |
| [`POST /api/auth/local`](./auth.md#post-api-auth-local) | — | 開発用のログイン（有効なときだけ） |
| [`POST /api/auth/admin/signout`](./admin.md#post-api-auth-admin-signout) | — | 管理画面からログアウト |
| [`GET /api/admin/dashboard`](./admin.md#get-api-admin-dashboard) | 管理者 | 管理画面の集計 |
| [`GET /api/admin/users`](./admin.md#get-api-admin-users) | 管理者 | ユーザーの一覧 |

## 共通事項

- 本文はJSON（`Content-Type: application/json; charset=utf-8`）で、`Cache-Control: private, no-store`・`Vary: Cookie` を付けます。`/api/shared`・`/api/gallery`・`/api/gallery/categories` は `Cache-Control: no-store` です。
- エラーは `{ "error": "<キー>" }` です。キーはアプリの `errors` のメッセージのキーで、画面が利用者の言語で表示します。
- すべての応答に `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`・`X-Frame-Options: DENY`・`X-Content-Type-Options: nosniff`・`Referrer-Policy: strict-origin-when-cross-origin` を付けます（Vercel では `next.config.mjs` のヘッダーが Go の関数に届かないため）。
- `HEAD` は `GET` と同じに答えます（本文なし）。

### エラー

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

503 で答えた失敗は、操作名（`workspace.read` など）を付けて Sentry に送ります（[docs/sentry.md](https://github.com/Sparklingstadt/typle-r/blob/main/docs/sentry.md)）。

## 認証

アカウントは `github:<GitHubのユーザーID>`、または FFPF ID でログインしたときのアカウントです。ログインの流れは [ログイン](./auth.md) を見てください。

- `Authorization` ヘッダーがあるリクエストは、アプリ（iPad・Mac・Android・Windows）のものとして `Authorization: Bearer <トークン>` だけで判断し、Cookie は見ません。トークンは [`POST /api/auth/token`](./auth.md#post-api-auth-token) で受け取ります。
- ないリクエストはセッションの Cookie で判断します。名前は HTTPS では `__Host-` 付きで、`HttpOnly`・`SameSite=Lax`・`Path=/` です。セッションはログインから30日で切れ、使っても延びません。
- データを読み書きするリクエストは、そのたびにセッションが無効にされていないか（`POST /api/auth/signout?everywhere=1` の後のログインか）をDBで確かめます。無効なら `401 loginRequired` で、Cookie を消します。確かめられなければ `503 databaseUnavailable` です。

### 書き込みの制限（CSRF 対策）

Cookie で書き込むリクエストは、`Origin` がアプリの origin（`AUTH_URL`。小文字、既定のポートなし）と同じで、`Content-Type` の `;` より前が `application/json` のときだけ受け付けます。違えば `403 forbiddenRequest` です。

::: tip
ほかのサイトのフォームはこの `Content-Type` を送れないため、他サイトから Cookie で保存されることはありません。アプリのトークンはブラウザーが勝手に送らないため、トークンのリクエストに `Origin` は要りません（`Content-Type` は要ります）。
:::

## コードの構成

| 場所 | 内容 |
|---|---|
| `api/index.go` | Vercel の Go の関数（1つだけ）。`vercel.json` の `rewrites` がバックエンドのパスをすべてここへ送り、`server/vercel` が元のパスで振り分ける |
| `server/vercel` | 環境変数から `internal/web` を組み立てる。`/api/auth` はセッションの応答が DB を待たないよう、DB を開かずに組み立てる |
| `server/cmd/typle-web` | 手元でこの API を起動するコマンド |
| `server/internal/web` | HTTPハンドラー（`web.go` がパスの一覧） |
| `server/internal/session` | Cookie・トークン・ログイン途中の状態の署名 |
| `server/internal/auth` | GitHub の OAuth と FFPF ID のクライアント |
| `server/internal/store` | `typle_workspaces`・`typle_records`・`typle_shared_packs`・`typle_admins` などの読み書き |
| `server/internal/operation` | 記録の追加・変更・削除（`/api/v1` と共通） |
