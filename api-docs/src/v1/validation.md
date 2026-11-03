# 検証

書き込みの内容の規則です。どれもアプリで保存するときと同じで、[アプリのAPI](/app/workspace.md#put-api-workspace) の保存も同じ規則で確かめます。エラーのステータスとキーの一覧は [共通事項とエラー](./common.md#エラー) にあります。

## リストの検証

- `name`: 前後の空白を除いて1文字以上（`listNameRequired`）、ほかのリストと同じ名前は不可（前後の空白を除き、大文字小文字を区別しない。比べ方はアプリと同じJavaScriptの `toLowerCase` で、語末の `Σ` は `ς`、`İ` は `i̇` になる。`listNameDuplicate`）。前後の空白を除いて保存する。
- `words`: 1件以上（`wordsRequired`）。`display`・`input` は空白だけでない文字列（`wordFieldsRequired`）。`annotation` は省略すると `""`。単語の前後の空白はそのまま保存する。
- `category`・`tags`（v0.78.0 から。省略できる）: 前後の空白を除いて保存し、空のタグと、大文字小文字だけ違う同じタグは除く。空になれば保存しない。
- `writing`（省略できる）: `{ "language": "<言語>" }` だけ。言語は `en`・`ja`・`zh-Hans`・`zh-Hant`・`ko`・`fr`・`de`・`es`・`ru`・`cs` のどれか（それ以外は `invalidWritingLanguage`）。作成で省くと付けず、更新で省くと今のまま、`""` の言語で外す（`language` のない `{}` も外す）。
- 自作のリストが150件あるときの作成・複製は `listLimit`。フォローした公式パックのリストは150件に数えない（v2.16.0 から）。
- `packId`（v0.95.0 から）: 名前はそのパックのほかのリストと違えばよい（`packId` を省略した作成ではすべてのリストと比べる）。ないパックは `400 packNotFound`。作成で `packId` と `category`・`tags` を一緒に送ると `invalidList`（パックの値を使うため）。リストと同じ名前の1リストだけのパックは、リストの名前を変えるとパックの名前も変わるため、そのリストをほかのパックと同じ名前にはできない（`listNameDuplicate`）。
- `levels`（v0.95.0 から）: 前後の空白を除いて保存し、空の難易度は除く。空になれば保存しない。
  - 1 つのリストの難易度は 1 つまでで、空を除いて 2 つ以上あると `tooManyLevels`（v0.97.0 から。例: `["基本", "初級"]`。それまでは 5 つまで。アプリの `PUT /api/workspace` は拒否せず、1 つにまとめて保存する）。
  - 練習画面は難易度（ないときはリスト名）でパックの中のリストを選ぶため、同じパックのほかのリストと同じになると選べないリストができるので `levelsConflict`（例: `["基本"]` と `["基本"]`、または難易度のない「基本」という名前のリスト）。

### 長さ

長さは UTF-16 の文字数で数えます。超えると `invalidList` です。

| 項目 | 上限 |
|---|---|
| 名前 | 200 |
| 単語 | 1000件 |
| `display`・`input` | 1000 |
| `annotation` | 2000 |
| カテゴリ | 50 |
| タグ | 1つ50・20個まで |
| 難易度 | 50 |

NUL文字（`\u0000`）はDBに保存できないため、名前・単語・難易度のどこにあっても `invalidList` です。

## パックの検証

v0.95.0 からです。

- `name`: 前後の空白を除いて1文字以上（`packNameRequired`）、ほかのパックと同じ名前は不可（比べ方はリスト名と同じ。`packNameDuplicate`）。前後の空白を除いて保存する。
- `description`: 前後の空白を除いて保存する。`category`・`tags`: リストと同じ規則で整える。
- 長さ（UTF-16の文字数）: 名前200、説明500、カテゴリ50、タグ1つ50・20個まで。超えるか NUL文字（`\u0000`）があると `invalidPack`。作成で `lists` がない・空のときも `invalidPack`。
- 作成の `lists` はそれぞれ「リストの検証」と同じ規則で、前のリストと比べて確かめる（名前の重なりは `listNameDuplicate`、難易度の重なりは `levelsConflict`、2 つ以上の難易度は `tooManyLevels`）。自作のリスト（フォローした公式パックのリストを除く）が150件を超える作成・複製・取り込みは `listLimit`。

## パックのファイルの取り込み

アプリで「ファイルから追加」するときと同じです（v0.95.0 から）。ファイルの形は [`GET /api/v1/packs/{p}/export`](./read.md#get-api-v1-packs-p-export) を見てください。

- 先頭の BOM は読み飛ばす。JSONでない、`format` が `typle-pack` でない、`version` が `1` でない、形が違う（`pack.name`・`lists`・各リストの `name`・`words`、各単語の `display`・`input`・`annotation` が文字列でないなど）、リストが1つもないファイルは `400 packFileUnreadable`。Typleの知らない項目は読み飛ばす。
- 中身は作成と同じ規則で確かめる（`packNameRequired`・`invalidPack`、リストの各キー、`listLimit`）。パック名がほかのパックと同じなら「名前（2）」「名前（3）」…にする。
- 難易度は拒否せずに直す（v0.96.3 から）: 2 つ以上の難易度（5 つまで）は、両端の空白と「・」を除き空を除いて「・」でつないだ 1 つにし（50 文字に収まるよう切り、切ったあとも両端の「・」と空白を除く。v0.97.0 から。例: `["基本", "初級"]` → `["基本・初級"]`）、リストどうしで同じになった難易度は後のリストに「（2）」…を付けて分ける（保存したデータを読み込むときと同じ）。以前に書き出したファイルや共有リンクも取り込めるようにするため。
- パック・リストのIDは新しく作り、作成日時は今の時刻、記録は空です。1MiB を超えると `413 importTooLarge`。

## CSV・TSV の取り込み

アプリで取り込むときと同じです。

- 1行目は見出しで、`input`・`display` が必須、`annotation` は任意（誤記の `anotation` も読む）。順番は問わない。
- `"` で囲んだ項目には区切り文字・改行・`""`（`"` 1文字）を入れられる。先頭の BOM と空行は読み飛ばす。単語の前後の空白・順序・重複はそのまま保存する。
- ファイルは UTF-8 で送る。Excel の既定の Shift_JIS など、UTF-8 として読めないファイルはアプリと同じく `400 importFileEncoding`（v0.53.1 から。それまでは読めない文字を � にして保存していた）。
- リスト名は作成と同じ検証（`listNameRequired`・`listNameDuplicate`・`invalidList`・`listLimit`）。`format` がないか `csv`・`tsv` 以外なら `400 invalidQuery`。

誤りは `400` で、行番号があるものは `line` を付けます（例 `{ "error": "importQuote", "line": 3 }`）。1MiB を超えると `413 importTooLarge` です。

| キー | 誤り |
|---|---|
| `importQuote` | 引用符の誤り |
| `importHeaderRequired`・`importHeaderDuplicate`・`importHeaderUnknown` | 見出しがない・重なる・知らない |
| `importNoRows` | 単語の行がない |
| `importTooManyRows` | 1000行を超える |
| `importColumnCount` | 列数が見出しと違う |
| `importFieldRequired` | `input`・`display` が空 |
| `importFieldTooLong` | 1000文字超（`annotation` は2000文字超） |

## 端末の検証

アプリで端末を保存するときと同じです。

- `name`: 前後の空白を除いて1文字以上（`deviceNameRequired`）、100文字まで（`deviceNameTooLong`）。`layout`: 省略すると `""`、200文字まで（`deviceLayoutTooLong`）。長さは前後の空白を含めて数え、保存するときに前後の空白を除く。
- ほかの端末と同じ名前は不可（大文字小文字を区別しない。比べ方はリスト名と同じ）。組み込みの「デフォルト」と同じ名前も不可で、アプリの6言語での名前（デフォルト・Default・默认・預設・По умолчанию・Par défaut）と比べる（`deviceNameDuplicate`）。
- 端末は100台まで（`deviceLimit`）。NUL文字（`\u0000`）は `invalidDevice`。

## 記録の検証

- `time`: 0以上の数（秒）。`date`: [起動](./README.md#起動)で書いた日時の形。保存するときに `2026-10-10T02:00:00.000Z` の形（UTC）にそろえる。
- `mistakes`: 0以上の整数。`accuracy`: 0〜100の数。`wordCount`: 1以上の整数で、省略するとリストの今の単語数。`mode` は送れない（送ると `null` でも `400 invalidJson`）。思い出して打った記録（`"recall"`）と手書き練習の記録（`"writing"`）はアプリだけが保存する。
- `id`: 1〜100文字の英数字・`_`・`-`。省略するとサーバーが UUID で決める。同じ `id` で送り直しても記録は増えないので、失敗したら同じ本文でやり直せます。
- `deviceId`: 省略できる。登録済みの端末のIDなら、その名前と配列を記録にコピーする。`default` は組み込みの「デフォルト」。どちらでもなければ `deviceNotFound`。
- 1リストの記録は10000件まで（`recordLimit`）。ほかの誤りは `invalidRecord`。
- 変更（`PATCH`）も同じ規則です。`deviceId` に `""` を指定すると記録から端末を外します（アプリの「未選択」と同じ）。
- 変更・削除できるのは `id` のある記録だけです。`id` のない古い記録は、アプリの「練習記録」から削除してください。
