# GraphQL（/api/graphql）

iPad・Mac 版がアカウントのデータと共有・ギャラリーを読み書きする API です。Web版は v2.14.0〜v2.41.0 の間これを使い、v2.41.1 から REST のパスへ戻りました。スキーマは [`server/internal/web/graph/schema.graphqls`](https://github.com/Sparklingstadt/typle-r/blob/main/server/internal/web/graph/schema.graphqls) で、リゾルバーは `server/internal/web/graphql.go` です。

同じことをする REST のパス（[ワークスペース](./workspace.md)・[共有とギャラリー](./shares.md)・[管理画面](./admin.md)）があり、Web版はそちらを使います。iPad・Mac 版が REST へ移ったら、この API は消します。ログイン（[`/api/auth/*`](./auth.md)）と `/api/health` は REST だけです。

## 操作

| フィールド | 種類 | ログイン | 対応する REST | 内容 |
|---|---|---|---|---|
| `workspace` | Query | 要 | `GET /api/workspace` | ワークスペース全体 |
| `shares` | Query | 要 | `GET /api/shares` | 共有中のパック |
| `sharedPack(id)` | Query | 不要 | `GET /api/shared?id=` | 共有されたパックのファイル。止めたリンクは `null` |
| `gallery(q, category, sort, page)` | Query | 不要 | `GET /api/gallery` | ギャラリーの1ページ。`sort` は `NEW`（既定）か `POPULAR`、`page` は1から |
| `galleryCategories` | Query | 不要 | `GET /api/gallery/categories` | ギャラリーのカテゴリと件数 |
| `adminDashboard` | Query | 管理者 | `GET /api/admin/dashboard` | 管理画面の集計 |
| `adminUsers(page)` | Query | 管理者 | `GET /api/admin/users?page=` | ユーザーの一覧の1ページ（0から） |
| `adminGallery` | Query | 管理者 | `GET /api/admin/gallery` | ギャラリーのパックと通報 |
| `saveWorkspace(input)` | Mutation | 要 | `PUT /api/workspace` | 読んだときの `revision` で保存する。変わっていれば `conflict`（409） |
| `addRecord(input)` | Mutation | 要 | `POST /api/workspace/records` | 記録を1件追加する。`added` は新しい記録なら `true` |
| `deleteRecord(input)` | Mutation | 要 | `DELETE /api/workspace/records` | 記録を1件削除する。もうないときも成功 |
| `sharePack(packId, listed)` | Mutation | 要 | `PUT /api/shares` | パックを共有する（共有中なら中身を取り直す）。`listed` でギャラリーに載せる・外す |
| `stopSharing(packId)` | Mutation | 要 | `DELETE /api/shares?pack=` | 共有をやめる。共有していなくても成功 |
| `countAdded(id)` | Mutation | 不要 | `POST /api/gallery/added?id=` | ギャラリーのパックが追加されたことを数える |
| `reportPack(id, reason)` | Mutation | 不要 | `POST /api/gallery/reports` | ギャラリーのパックを通報する |
| `setPackHidden(id, hidden)` | Mutation | 管理者 | `POST /api/admin/gallery/hide`・`unhide` | パックを非公開にする・戻す |

- ワークスペースの `lists`・`packs`・`devices`・`interests`、記録、共有パックのファイル、通報の理由ごとの件数（`reasons`）は `JSON` スカラーで、保存されている形のまま（Typle の知らない項目も）返します。
- `saveWorkspace` の入力は `PUT /api/workspace` の本文と同じです。`lists`・`packs`・`devices`・`interests` は、省略すると保存済みのまま、`null` は `invalidWorkspace` です。
- `sharePack` の `listed` は、省略しても `null` でも掲載はそのままです（REST の `"listed": null` は `invalidWorkspace`）。
- ギャラリーのパックの `description`・`category` は、ないとき `null`、`tags` は `[]` です（REST では項目ごと省きます）。
- 日時（`Time`）は RFC 3339 で、秒の端数があれば付けます（`2026-10-01T02:03:04.005Z`）。

```sh
curl -X POST http://localhost:3000/api/graphql \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' -b 'typle-session=…' \
  -d '{"query":"query Workspace { workspace { revision accountId } }"}'
```

アプリのトークン（[`POST /api/auth/token`](./auth.md#post-api-auth-token)）でも、REST と同じく `Authorization: Bearer <トークン>` で使えます。

## リクエスト

- `POST` で `Content-Type: application/json` だけを受け付けます（ほかのメソッドは `405 methodNotAllowed`、ほかの型は `403 forbiddenRequest`）。フォームはほかのサイトから JSON を送れないためです。GET・WebSocket・バッチは使えません。
- Mutation は、REST の書き込みと同じく、アプリ自身の Origin か、アプリのトークン（`Authorization`）が要ります。ないときはそのフィールドが `forbiddenRequest`（403）です。`setPackHidden` はアプリ自身の Origin だけです（管理者にはトークンがないため）。
- `countAdded` と `reportPack` は、REST と同じく1分あたりの回数をクライアントごとに数え（同じ枠を REST と分け合います）、超えると `tooManyRequests`（429）で、応答に `Retry-After` を付けます。
- 本文の上限は 1MiB＋64KiB（クエリの分）で、超えると `413 workspaceTooLarge` です。
- クエリの複雑さは 200 まで（フィールド1つで1）です。スキーマの取得（introspection）はできます。
- 応答は `Cache-Control: private, no-store`・`Vary: Cookie` です。

## エラー

フィールドの処理で断るときは、REST と同じエラーのキーを使います。HTTP のステータスは 200 で、エラーの `extensions` にキーと REST のステータスを入れます。

```json
{ "data": null, "errors": [{ "message": "conflict", "path": ["saveWorkspace"], "extensions": { "code": "conflict", "status": 409 } }] }
```

- キーと状況は REST と同じです（`loginRequired`・`loginAccountChanged`・`conflict`・`invalidWorkspace`・`invalidQuery`・`invalidReport`・`notInGallery`・`sharedPackHidden`・`tooManyRequests`・`adminRequired`・`adminForbidden`・`databaseUnavailable` など）。サーバーの障害（503）は REST と同じ操作名で Sentry に送ります。
- 取り消したログインの Cookie と、管理者でなくなったアカウントの管理者の Cookie は、REST と同じく応答で消します。
- 実行する前に断るもの（上の「リクエスト」）は、REST と同じ `{ "error": "<キー>" }` と、そのステータスで返します。
- 文法やスキーマに合わないクエリは `422` で、`extensions.code` は gqlgen のもの（`GRAPHQL_VALIDATION_FAILED` など）です。

## スキーマを変えるとき

`schema.graphqls` を直したら、生成したコードを作り直してコミットします。

```sh
go generate ./server/internal/web/graph
```

gqlgen は `go.mod` の `tool` で固定しています（v0.17.94。これより新しい版は Go 1.26 が要ります）。リゾルバーは手で書いており、REST のハンドラーと同じ関数（`saveWorkspace`・`recordAdd`・`sharePack`・`reportPack` など）を呼びます。
