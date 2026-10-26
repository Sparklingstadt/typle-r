# パックのファイルの共通 fixture

保存データ `library`（`packs`・`lists`）のパック `packId` を書き出した文字列が `file` です。
TS は `tests/packFile.test.cjs`、Go は `server/internal/workspace/packfile_test.go` が読みます。
TS と Go は同じ `library` から **同じバイト列** を書き、`file` を読んで取り込み、また書き出すと同じ文字列（パック名だけ「（2）」付き）に戻ります。

- `basic.json`: ラベルのないパック、難易度のないリスト1つ。
- `full.json`: 説明・カテゴリ・タグのあるパック、難易度のあるリスト2つ。保存データには知らない項目・記録・`origin` があり、ファイルには出ません。リストの間に別のパックのリストがあります。

## ファイルの形

```json
{ "format": "typle-pack", "version": 1,
  "pack": { "name": "…", "description": "…", "category": "…", "tags": ["…"] },
  "lists": [{ "name": "…", "levels": ["…"], "words": [{ "display": "…", "input": "…", "annotation": "…" }] }] }
```

## Go で守る約束（書き出し）

- TS の `JSON.stringify(value, null, 2) + '\n'` と同じ: 2 スペースのインデント、`": "` の後に空白1つ、末尾に改行1つ。空の配列・オブジェクトは出ない（空の任意項目は書かないため）。
- 項目の順は上の形のとおり: `format`・`version`・`pack`・`lists`、`pack` は `name`・`description`・`category`・`tags`、リストは `name`・`levels`・`words`、単語は `display`・`input`・`annotation`。
- `description`・`category` が空文字、`tags`・`levels` が空配列またはないときは項目ごと書かない。`name` と単語の3項目は空でも書く。
- 記録・ID・作成日時・`origin`・Typle が知らない項目は書かない。リストはそのパックのリストを保存データの順に並べる。
- 文字列は `JSON.stringify` のとおりにエスケープする: `"` → `\"`、`\` → `\\`、`\b` `\f` `\n` `\r` `\t` は短い形、その他の U+0000〜U+001F は `\u00xx`（小文字の16進）。それ以外はそのまま書く（`/` も ASCII 以外も）。
  - Go の `encoding/json` は既定で `<` `>` `&` を `<` などにするので、`SetEscapeHTML(false)` が要る。
  - Go の `encoding/json` は U+2028・U+2029 を常に ` `・` ` にするが、TS はそのまま書く。`full.json` の注釈に U+2028 があるので、Go は書いた後にそのままの文字へ戻す（またはエンコーダーを自前で書く）。

## Go で守る約束（読み込み）

- JSON でない・オブジェクトでない・`format` が `"typle-pack"` でない・`version` が数値の `1` でない・`pack` がオブジェクトでない・`lists` が配列でないか空、は `packFileUnreadable`。
- `pack.name`・リストの `name`・単語の `display`・`input`・`annotation` は文字列が必須（`null` も読めない）。`description`・`category` は文字列、`tags`・`levels` は文字列の配列で、省略か `null` は「ない」として読む。型が違えば `packFileUnreadable`。
- 知らない項目は捨てる。

## Go で守る約束（取り込み・複製・公式パックの追加）

- 取り込みの判定の順: リストがない（`packFileUnreadable`）→ パック名が空（`packNameRequired`）→ リストの数が `MaxLists` を超える（`listLimit`）→ リストを順に、名前が空（`listNameRequired`）・同じファイル内で名前が重なる（大文字小文字・前後の空白を無視、`listNameDuplicate`）・単語なし（`wordsRequired`）・単語の表示か入力が空白だけ（`wordFieldsRequired`）・難易度を整える（前後の空白を除き空を捨てる。6個以上か51文字以上は保存の検証エラー）・それまでのリストと難易度が重なる（`levelsConflict`）。最後に保存と同じ補正・検証（パック名の長さ・ラベルの上限など）。
- 取り込んだパック: 名前は前後の空白を除き、重なれば「名前（2）」「名前（3）」…（元の名前を 200 文字に収まるよう切り、末尾の空白を除く）。説明は前後の空白を除いて空なら書かない。カテゴリ・タグは保存と同じ整え方（前後の空白、空を捨てる、タグは大文字小文字を無視して重複を捨てる）。作成日時は今。パックはいちばん後ろ、リストは全リストの後ろ。
- リスト: 名前は前後の空白を除く。単語はそのまま（前後の空白も残す）。記録は空、作成日時は今。
- 複製: 元のパックの直後に入れ、リストは全リストの後ろ（元の順）。名前は「名前（コピー）」「名前（コピー2）」…（ロケールの接尾辞。元の名前を 200 文字に収まるよう切る。末尾の空白は除かない）。説明・カテゴリ・タグ・リスト名・難易度・単語を写し、記録・`origin`・知らない項目は写さない。複製では中身を検証し直さない。
- 公式パックの追加: 取り込みと同じで、`origin: { catalogId, version }` を付ける。
