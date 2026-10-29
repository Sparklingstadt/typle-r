# パックの共有

単語パックをリンクで共有します（v0.96.0 から）。共有するとパックをその時点のファイルにコピーし、リンクを開いた人はそのコピーを読みます。リンクの URL は画面がサイトの origin と `id` から作るため、応答には含みません。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `GET /api/shares` | なし | `200 { "shares": [{ "id", "packId", "name", "updatedAt" }] }`（新しく更新した順） |
| `PUT /api/shares` | `{ "packId" }`（ほかの項目はなし。4KiB まで） | `200 { "id", "packId", "name", "updatedAt" }`。共有中のパックは同じ `id` のまま中身を取り直す。ないパックは `404 packNotFound`、本文が不正なら `400 invalidWorkspace` |
| `DELETE /api/shares?pack=<パックのID>` | なし（`Content-Type` は見ない。`Origin` は見る） | `204`。共有していないパックも `204`。`pack` がなければ `400 invalidWorkspace` |
| `GET /api/shared?id=<共有のID>` | なし | `200` とパックのファイル（`typle-pack` 形式。[`GET /api/v1/packs/{p}/export`](/v1/read.md#get-api-v1-packs-p-export) と同じ形）。持ち主の情報は含まない。ない共有・UUID でない `id` は `404 sharedPackNotFound` |

- `/api/shares` はログインが必要です。`/api/shared` はログイン不要で、すべての応答（エラーも）に `X-Robots-Tag: noindex` を付けます。共有をやめたら直ちに読めなくなるよう、キャッシュさせません（`Cache-Control: no-store`）。
- パックを削除する保存（リストの移動で空になったパックを含む）は、同じトランザクションでその共有も消します。`/api/v1` の書き込みでパックがなくなったときも同じです。
