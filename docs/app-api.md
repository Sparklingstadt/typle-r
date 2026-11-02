# アプリのAPI（`/api/*`）

アプリ自身のバックエンドの仕様は、v2.1.2 から VuePress のサイト [api-docs/src/app](../api-docs/src/app/README.md) に移しました。サイトは `cd api-docs && npm ci && npm run docs:dev` で見られます。

| 以前の章 | 移った先 |
|---|---|
| 共通事項・認証・エンドポイントの一覧・コードの構成 | [api-docs/src/app/README.md](../api-docs/src/app/README.md) |
| `/api/workspace`・`/api/workspace/records` | [api-docs/src/app/workspace.md](../api-docs/src/app/workspace.md) |
| `/api/shares`・`/api/shared` | [api-docs/src/app/shares.md](../api-docs/src/app/shares.md) |
| ログイン | [api-docs/src/app/auth.md](../api-docs/src/app/auth.md) |
| 管理画面 | [api-docs/src/app/admin.md](../api-docs/src/app/admin.md) |

`/api/workspace/records` の OpenAPI 定義は、これまでどおり [docs/api/workspace-records.openapi.json](api/workspace-records.openapi.json) です（サイトの [openapi.md](../api-docs/src/openapi.md) がビルド時に読み込みます）。
