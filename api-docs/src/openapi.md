# OpenAPI（記録の操作）

アプリが練習記録を1件ずつ変える [`/api/workspace/records`](/app/workspace.md#記録の追加と削除) の本文・応答・エラーコードは、OpenAPI 3.1 の定義 `docs/api/workspace-records.openapi.json` にあります（v1.6.0 から）。

- Go は `server/internal/web/records_test.go`、TS は `tests/recordSchema.test.cjs` が、この定義と実装を照合します。
- エラーキーは画面のメッセージ（`src/messages/*/errors.json`）のキーです。`x-app-shows` が `false` の応答はアプリが受け取ることのないもので、画面のメッセージを持ちません。
- このページの下の定義は、ビルドのときにリポジトリのファイルをそのまま読み込んでいます。定義を変えるときは `docs/api/workspace-records.openapi.json` を直してください。

## 応答の一覧

| ステータス | `POST`（記録を追加する） | `DELETE`（記録を削除する） |
|---|---|---|
| 200 | すでにあった（`RecordAdded`） | 削除した、またはすでに無い（`Workspace`） |
| 201 | 追加した（`RecordAdded`） | — |
| 400 | `emptyRequest`・`invalidRecord`・`deviceNotFound`・`recordLimit` | `emptyRequest`・`invalidRecord` |
| 401 | `loginRequired`・`loginAccountChanged` | `loginRequired`・`loginAccountChanged` |
| 403 | `forbiddenRequest` | `forbiddenRequest` |
| 404 | `recordListDeleted` | — |
| 405 | `methodNotAllowed`（アプリは送らない） | `methodNotAllowed`（アプリは送らない） |
| 413 | `workspaceTooLarge` | `workspaceTooLarge` |
| 503 | `databaseUnavailable`・`workspaceSaveFailed` | `databaseUnavailable`・`workspaceSaveFailed` |

スキーマは `Device`・`RecordInput`・`RecordAdd`・`RecordDelete`・`Workspace`・`RecordAdded` です。

## 定義

@[code json](../../docs/api/workspace-records.openapi.json)
