# 書き込み

::: warning
書き込みは `-writable` を付けて起動したときだけです。そうでなければ `405 methodNotAllowed` です。
:::

本文は `Content-Type: application/json` のJSONオブジェクトで、1MiB までです（本文のない `DELETE` と複製を除く）。応答の `list` は [`GET /api/v1/lists/{l}`](./read.md#get-api-v1-lists-l) と、`pack` は [`GET /api/v1/packs/{p}`](./read.md#get-api-v1-packs-p) と同じ形です。内容の規則は [検証](./validation.md) を見てください。

## リスト

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/lists` | `{ "name", "packId"?, "category"?, "tags"?, "levels"?, "writing"?, "words": [{ "display", "input", "annotation"? }] }` | `201 { "list" }`。IDはサーバーが UUID で決め、`createdAt` は今の時刻。最後に追加する。`packId` を省略するとリスト名で1リストのパックを作り、`category`・`tags` をそのパックに付ける。`packId` を指定するとそのパックの最後のリストになる（v0.95.0 から） |
| `PATCH /api/v1/lists/{l}` | `{ "name"?, "packId"?, "category"?, "tags"?, "levels"?, "writing"?, "words"? }`（少なくとも1つ） | `200 { "list" }`。`words`・`tags`・`levels` は全体を置き換える。`writing` は `{ "language": "ja" }` で手書き練習の言語を付け、`{ "language": "" }` で外し、省くと今のまま。`""` のカテゴリ・空の `tags`・空の `levels` で外す。`category`・`tags` はリストの入っているパック（`packId` を指定したら移した先）の値を変える。`packId` で別のパックに移すと、そのパックの最後のリストの後ろに入り、空になった元のパックは消える（v0.95.0 から）。記録・`createdAt`・並び順（移さないとき）は残る |
| `DELETE /api/v1/lists/{l}` | なし | `204`（本文なし）。記録も一緒に消える |
| `POST /api/v1/lists/{l}/copy` | なし、または `{ "name"? }` | `201 { "list" }`。元のリストと同じパックの最後に入る（v0.95.0 から。それまでは1リストの新しいパック）。単語をコピーし、難易度・記録はコピーしない。名前を省略すると「元の名前（コピー）」、同じパックで使われていれば「（コピー2）」…（200文字に収まるよう元の名前を切る）。名前は同じパックのリストと違えばよい（v0.47.0 から） |
| `POST /api/v1/lists/import?name=…&format=csv\|tsv&packId=…` | CSV・TSV のファイルそのもの（`Content-Type` は `text/csv`・`text/tab-separated-values`・`text/plain`。1MiB まで） | `201 { "list" }`。アプリの「CSV・TSVファイルから追加」と同じ読み方で単語を読み、`name` の名前のリストを作る（v0.48.0 から。[CSV・TSV の取り込み](./validation.md#csv・tsv-の取り込み)）。`packId` を指定するとそのパックの最後のリストになり、省略すると新しいパックを作る（v0.95.0 から） |

## パック

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/packs` | `{ "name", "description"?, "category"?, "tags"?, "lists": [{ "name", "levels"?, "words": [{ "display", "input", "annotation"? }] }] }`（リスト1つ以上） | `201 { "pack" }`。パック・リストのIDはサーバーが UUID で決め、`createdAt` は今の時刻。パックは最後に、リストはすべてのリストの後ろに追加する（v0.95.0 から） |
| `PATCH /api/v1/packs/{p}` | `{ "name"?, "description"?, "category"?, "tags"?, "listOrder"? }`（少なくとも1つ） | `200 { "pack" }`。`tags` は全体を置き換え、`""` の説明・カテゴリ・空の `tags` で外す。カテゴリ・タグは中のリストの値にもなる。`listOrder` は中のリストのIDを新しい順に並べたもの: パックにないIDは無視し、並べなかったリストは今の順で後ろに続く（v0.95.0 から） |
| `DELETE /api/v1/packs/{p}` | なし | `204`（本文なし）。中のリストと記録も一緒に消える（v0.95.0 から） |
| `POST /api/v1/packs/{p}/copy` | なし、または `{ "name"? }` | `201 { "pack" }`。元のパックの直後に入る。説明・カテゴリ・タグと、リストの名前・難易度・単語をコピーし、記録・`origin`（パックとリストの）はコピーしない。フォロー中の公式パックも複製でき、複製は自分のパックになる（v0.98.0 から）。名前を省略すると「元の名前（コピー）」、使われていれば「（コピー2）」…（v0.95.0 から） |
| `POST /api/v1/packs/import` | パックのファイルそのもの（`Content-Type: application/json`。1MiB まで） | `201 { "pack" }`。アプリの「ファイルから追加」と同じ読み方でパックを最後に追加する（[パックのファイルの取り込み](./validation.md#パックのファイルの取り込み)。v0.95.0 から） |

## 記録

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/lists/{l}/records` | `{ "id"?, "time", "date", "mistakes", "accuracy", "wordCount"?, "mode"?, "deviceId"? \| "device"? }` | 追加したら `201 { "record" }`。同じリストに同じ `id` の記録があれば追加せず、保存済みの記録を `200 { "record" }` で返す |
| `PATCH /api/v1/lists/{l}/records/{r}` | `{ "time"?, "date"?, "mistakes"?, "accuracy"?, "wordCount"?, "deviceId"? }`（少なくとも1つ） | `200 { "record" }`。送らなかった項目とTypleの知らない項目は残る。`id` は変えられない |
| `DELETE /api/v1/lists/{l}/records/{r}` | なし | `204`（本文なし） |

記録の追加は、アプリの練習画面（本番の [`POST /api/workspace/records`](/app/workspace.md#記録の追加と削除)）と同じ操作（`server/internal/operation` の `AddRecord`）です（v1.2.0 から）。revision を使わないため、別の画面でリストを編集していても拒否されず、同じ `id` の再送で記録が重複しません。ゲスト保存も同じ規則に従います（`tests/fixtures/records`）。

- 端末は `deviceId`（追加する時点で登録されている端末として保存）か、`device`（`{ "id", "name", "layout" }`。練習した時点の端末としてそのまま保存。アプリはこちらを送ります）のどちらかで指定します（`device` は v1.2.0 から）。
- 記録の変更（`PATCH`）・削除（`DELETE`）も同じ操作（`UpdateRecord`・`DeleteRecord`）です。アプリの記録画面の削除は本番の [`DELETE /api/workspace/records`](/app/workspace.md#記録の追加と削除) を使います（v1.4.0 から）。
- 記録には練習したときの端末のコピーが入っているため、端末の名前を変えても削除しても、過去の記録の端末はそのままです（アプリと同じ）。

## 端末

| メソッドとパス | 本文 | 応答 |
|---|---|---|
| `POST /api/v1/devices` | `{ "name", "layout"? }` | `201 { "device" }`。IDはサーバーが UUID で決める。最後に追加する |
| `PATCH /api/v1/devices/{d}` | `{ "name"?, "layout"? }`（少なくとも一方） | `200 { "device" }` |
| `DELETE /api/v1/devices/{d}` | なし | `204`（本文なし） |

組み込みの `default` は変更・削除できません（`404 deviceNotFound`）。

## フォロー中の公式パック

アプリでフォローした公式パック（`origin.followed` が `true`）は、公式の内容のまま読み取り専用です（v0.98.0 から）。

- 変える書き込みは `409 packFollowed` で、何も保存しません: `PATCH /api/v1/packs/{p}`（`listOrder` も）、`POST /api/v1/lists`（`packId` がフォロー中のパック）、`PATCH /api/v1/lists/{l}`（フォロー中のパックのリスト、または `packId` でフォロー中のパックへ移すとき）、`DELETE /api/v1/lists/{l}`、`POST /api/v1/lists/{l}/copy`、`POST /api/v1/lists/import`（`packId` がフォロー中のパック）。ないパック・リストは今までどおり `404`・`400` です。
- できるもの: `DELETE /api/v1/packs/{p}`（フォロー解除。リストと記録も消える）、`POST /api/v1/packs/{p}/copy`（自分のパックになる）、記録の追加・変更・削除。
- 保存データを読むたびに、アプリと同じ変換をします。v0.98.0 より前に公式パックから追加したパック（`followed` のない `origin` のパックと、`origin` がなく ID が公式パックの `catalogId` と同じパック）はリスト・記録ごと除き、フォロー中のパックは説明・カテゴリ・タグとリスト（名前・難易度・単語・並び）を公式に揃えます。リストの記録は `origin.listId` が同じリストに残り、公式で増えたリストは `<パックの ID>:<公式のリストの ID>` の ID で加わり、公式からなくなったリストとカタログからなくなったパックは記録ごと除きます。変換の結果は次の書き込みで保存されます。
- フォロー中のパックのリストの単語は保存しません（v2.1.0 から）。読むときにカタログから戻すため、応答には公式の単語が入ります。

## アプリと同時に保存したとき

書き込みは1つのトランザクションでアカウントの行をロックし、リストを変えて `revision` を1増やします。その間のアプリの保存は待ち、そのあとは「ほかで保存された」として読み込み直します（アプリで2つのブラウザーから保存したときと同じ）。

::: warning
読み込み直す前にアプリで行った変更は保存されないので、APIで書き込むときはアプリの編集を終えておいてください。
:::

- パックの共有リンク（`typle_shared_packs`、v0.96.0 から）は、書き込みでパックがなくなると（パックの削除、リストの移動で空になったパックを含む）、同じトランザクションで消えます。共有の API（[`/api/shares`・`/api/shared`](/app/shares.md)）はアプリ自身のバックエンドにあり、`/api/v1` にはありません。
- 関心（`typle_workspaces.interests`、v0.99.0 から）は [`/api/workspace`](/app/workspace.md) だけが読み書きし、`/api/v1` には出さず、その書き込みでも変わりません。
- まだ一度も保存していないアカウントは、空のワークスペースに変更を加えて保存します（v0.98.0 から。それまでは最初の単語リスト）。
- 同じ `id` の記録の送り直しなど、何も変わらないときは保存しません。
- 保存後のリスト全体（JSON）が 896KiB を超える変更は `413 workspaceTooLarge` で、何も保存しません。アプリの保存（1MiB まで）に端末などの分を残すためです。すでに超えていても、小さくする変更（削除など）はできます。
