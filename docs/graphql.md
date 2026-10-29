# GraphQL API（`POST /api/graphql`）

Web 版がアカウントのデータを読み書きする API です（v2.2.0 から）。本番の Go のバックエンド（`server/internal/web/graphql.go`、Vercel の関数は `api/graphql.go`）が答えます。スキーマは [`server/internal/web/graph/schema.graphqls`](../server/internal/web/graph/schema.graphqls) です。

同じことをする REST のパス（`/api/workspace`・`/api/workspace/records`・`/api/shares`・`/api/shared`・`/api/admin/*`。[app-api.md](app-api.md)）は残しており、iPad・Mac・Android・Windows アプリはそちらを使います。スクリプト用の `/api/v1`（[api.md](api.md)）とは別のものです。

## 操作

| フィールド | 種類 | 対応する REST | 内容 |
|---|---|---|---|
| `workspace` | Query | `GET /api/workspace` | ログイン中のアカウントのワークスペース |
| `shares` | Query | `GET /api/shares` | 共有中のパック |
| `sharedPack(id)` | Query | `GET /api/shared?id=` | 共有リンクのパックのファイル。止めたリンクは `null`。ログインは要りません |
| `adminDashboard` | Query | `GET /api/admin/dashboard` | 管理者ダッシュボードの数字 |
| `adminUsers(page)` | Query | `GET /api/admin/users?page=` | ユーザー一覧の1ページ（0から） |
| `saveWorkspace(input)` | Mutation | `PUT /api/workspace` | 読んだときの `revision` で保存します。変わっていれば `conflict`（409） |
| `addRecord(input)` | Mutation | `POST /api/workspace/records` | 練習記録を足します。`added` は新しい記録なら `true` |
| `deleteRecord(input)` | Mutation | `DELETE /api/workspace/records` | 練習記録を消します。もうないときも成功です |
| `sharePack(packId)` | Mutation | `PUT /api/shares` | パックを共有するか、共有中のリンクへコピーし直します |
| `stopSharing(packId)` | Mutation | `DELETE /api/shares?pack=` | 共有をやめます。共有していなくても成功です |

- ワークスペースの `lists`・`packs`・`devices`・`interests` と、記録・共有パックのファイルは `JSON` スカラーで、保存されている形のまま（Typle の知らない項目も）返します。
- `saveWorkspace` の入力は `PUT /api/workspace` の本文と同じです。`lists`・`packs`・`devices`・`interests` は、省略すると保存済みのまま、`null` は `invalidWorkspace` です。
- 日時（`Time`）は RFC 3339 で、秒の端数があれば付けます（`2026-10-01T02:03:04.005Z`）。

```sh
curl -X POST http://localhost:3000/api/graphql \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' -b 'typle-session=…' \
  -d '{"query":"query Workspace { workspace { revision accountId } }"}'
```

アプリのトークン（`/api/auth/token`）でも、REST と同じく `Authorization: Bearer <トークン>` で使えます。

## リクエスト

- `POST` で `Content-Type: application/json` だけを受け付けます（ほかのメソッドは `405 methodNotAllowed`、ほかの型は `403 forbiddenRequest`）。フォームはほかのサイトから JSON を送れないためです。GET・WebSocket・バッチは使えません。
- Mutation は、REST の書き込みと同じく、アプリ自身の Origin か、アプリのトークン（`Authorization`）が要ります。ないときはそのフィールドが `forbiddenRequest`（403）です。
- 本文の上限は 1MiB＋64KiB（クエリの分）で、超えると `413 workspaceTooLarge` です。
- クエリの複雑さは 200 まで（フィールド1つで1）です。スキーマの取得（introspection）はできます。
- 応答は `Cache-Control: private, no-store`・`Vary: Cookie` です。

## エラー

フィールドの処理で断るときは、REST と同じエラーのキーを使います。HTTP のステータスは 200 で、エラーの `extensions` にキーと REST のステータスを入れます。

```json
{ "data": null, "errors": [{ "message": "conflict", "path": ["saveWorkspace"], "extensions": { "code": "conflict", "status": 409 } }] }
```

- キーと状況は REST と同じです（`loginRequired`・`loginAccountChanged`・`conflict`・`invalidWorkspace`・`levelsConflict`・`listLimit`・`invalidRecord`・`recordListDeleted`・`packNotFound`・`adminRequired`・`adminForbidden`・`invalidPage`・`databaseUnavailable`・`workspaceSaveFailed` など）。サーバーの障害（503）は REST と同じ名前で Sentry に送ります。
- 取り消したログインの Cookie と、管理者でなくなったアカウントの管理者の Cookie は、REST と同じく応答で消します。
- 実行する前に断るもの（上の「リクエスト」）は、REST と同じ `{ "error": "<キー>" }` と、そのステータスで返します。
- 文法やスキーマに合わないクエリは GraphQL の `422` で、`extensions.code` は gqlgen のもの（`GRAPHQL_VALIDATION_FAILED` など）です。

Web 版のクライアントは `src/core/graphql.ts` で、エラーを `GraphQLError`（`key`・`status`）にします。

## スキーマを変えるとき

`schema.graphqls` を直したら、生成したコードを作り直してコミットします。

```sh
go generate ./server/internal/web/graph
```

gqlgen は `go.mod` の `tool` で固定しています（v0.17.94。これより新しい版は Go 1.26 が要ります）。リゾルバーは手で書いており（`server/internal/web/graphql.go`）、REST のハンドラーと同じ関数（`saveWorkspace`・`recordAdd`・`sharePack` など）を呼びます。
