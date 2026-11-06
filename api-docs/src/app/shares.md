# パックの共有

単語パックをリンクで共有します（v0.96.0 から）。共有するとパックをその時点のファイルにコピーし、リンクを開いた人はそのコピーを読みます。リンクの URL は画面がサイトの origin と `id` から作るため、応答には含みません。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `GET /api/shares` | なし | `200 { "shares": [{ "id", "packId", "name", "updatedAt", "listed", "hidden" }] }`（新しく更新した順）。`listed` はギャラリーに載っているか、`hidden` は管理者に非公開にされたか |
| `PUT /api/shares` | `{ "packId" }` または `{ "packId", "listed" }`（`listed` は真偽値。ほかの項目はなし。4KiB まで） | `200 { "id", "packId", "name", "updatedAt", "listed", "hidden" }`。共有中のパックは同じ `id` のまま中身を取り直す。ないパックは `404 packNotFound`、本文が不正なら `400 invalidWorkspace`。非公開にされた共有に `listed` を送ると `409 sharedPackHidden` |
| `DELETE /api/shares?pack=<パックのID>` | なし（`Content-Type` は見ない。`Origin` は見る） | `204`。共有していないパックも `204`。`pack` がなければ `400 invalidWorkspace` |
| `GET /api/shared?id=<共有のID>` | なし | `200` とパックのファイル（[パックのファイル](#パックのファイル)）。持ち主の情報は含まない。ない共有・非公開にされた共有・UUID でない `id` は `404 sharedPackNotFound` |

- `/api/shares` はログインが必要です。`/api/shared` はログイン不要で、すべての応答（エラーも）に `X-Robots-Tag: noindex` を付けます。共有をやめたら直ちに読めなくなるよう、キャッシュさせません（`Cache-Control: no-store`）。
- パックを削除する保存（リストの移動で空になったパックを含む）は、同じトランザクションでその共有も消します。
- `listed` を送らない `{ "packId" }` だけの `PUT` は、ギャラリーへの掲載を変えません（今までのクライアントと同じ）。`listed: true` は中身を取り直してから掲載し（すでに載っていれば載せた日時は変えません）、`false` は中身を取り直してから掲載を外します。

## パックのファイル

アプリの「ファイルに書き出す」と同じ形です。

```json
{
  "format": "typle-pack",
  "version": 1,
  "pack": { "name": "Linux", "description": "よく使うコマンド", "category": "プログラミング", "tags": ["シェル"] },
  "lists": [{ "name": "基本", "levels": ["初級"], "words": [{ "display": "ls", "input": "ls", "annotation": "一覧" }] }]
}
```

## ギャラリー

ギャラリーは、掲載中で非公開にされていない共有の一覧です。読み取りの2つと追加数の1つは `/api/shared` と同じくログイン不要（ユーザーの確認はしません）で、すべての応答（エラーも）に `X-Robots-Tag: noindex`・`Cache-Control: no-store` を付けます。通報もログインは要りませんが、`Origin` と JSON の `Content-Type` を確かめます。

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `GET /api/gallery?q=&category=&sort=&page=` | なし | `200 { "packs": [{ "id", "name", "description"?, "category"?, "tags"?, "lists", "words", "added", "updatedAt" }], "more" }`。1ページ20件で、`more` は次のページがあるか。`q` は名前・説明・タグへの部分一致（大文字小文字を区別せず、前後の空白を除いて200文字まで。空なら絞らない）、`category` はカテゴリへの完全一致（空なら絞らない）、`sort` は `new`（既定。載せた新しい順）か `popular`（追加の多い順、同じなら載せた新しい順）、`page` は1から。`sort`・`page` が不正なら `400 invalidQuery` |
| `GET /api/gallery/categories` | なし | `200 { "categories": [{ "name", "count" }] }`（件数の多い順、同じなら名前の順） |
| `POST /api/gallery/added?id=<共有のID>` | なし（`Content-Type` は見ない。`Origin` は見る） | `204`。掲載中の共有なら追加数（`added`）を1増やす。そうでない共有・ない共有でも `204` で、何も変えない（載っているかどうかを知らせない）。1分あたり60回を超えると `429 tooManyRequests` |
| `POST /api/gallery/reports` | `{ "id", "reason" }`（`Content-Type: application/json` と、アプリの `Origin` が必要。4KiB まで）。`reason` は `inappropriate`・`spam`・`personalInfo`・`other` | `204`。掲載中で非公開にされていない共有に通報を記録する。`reason` や本文が不正なら `400 invalidReport`、`Origin` か `Content-Type` が違えば `403 forbiddenRequest`、掲載中で非公開でない共有がなければ `404 notInGallery`（リンクだけの共有も同じ）。1分あたり10回を超えると `429 tooManyRequests` |

- DB に届かないときは `503 databaseUnavailable` です。Vercel では、`GET /api/gallery` と `GET /api/gallery/categories` は `/api/shared` と同じく、ログインの設定がなくても DB だけで答えます。`POST /api/gallery/added` と `POST /api/gallery/reports` は `Origin` を確かめるため、`/api/shares` と同じ経路を通り、ログインの設定（`AUTH_SECRET`・`AUTH_URL`）がなければ `503 authUnavailable` です。
- 非公開にされた共有（管理者が `/api/admin/gallery/hide` で非公開にしたもの）は、ギャラリーに出ず、`GET /api/shared` も `404 sharedPackNotFound` になります。持ち主の `GET /api/shares` には `hidden: true` で返り、持ち主はその共有の `listed` を変えられません（`409 sharedPackHidden`）が、`PUT` での更新と `DELETE` での共有の終了はできます。
- `POST /api/gallery/added` は1分あたり60回、`POST /api/gallery/reports` は1分あたり10回まで、クライアントの IP ごとに数えます（アプリのトークン付きの要求も同じです）。1分ごとの固定窓で、`Origin`・`Content-Type`・本文が不正で先に断る要求は数えません。超えた要求は `429 tooManyRequests` で、`Retry-After`（窓が終わるまでの秒数。1以上）を付け、何も書き込みません。回数を数えられないとき（DB の失敗）は、制限なしで通さず `503 databaseUnavailable` です。
- IP は、Vercel 上では `X-Vercel-Forwarded-For`、`X-Forwarded-For`、`X-Real-Ip` の順に、最初の値が IP アドレスとして読めるものです（どれも読めなければ共通の「不明」として数えます）。Vercel 以外では接続元のアドレスだけです。DB には IP そのものでなく、専用の鍵での HMAC を10分だけ置きます（詳しくは README の「ギャラリーのレート制限」）。
