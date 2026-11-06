# CSV・TSV の共通 fixture

`cases.json` の `read` は、`source` を読んだ結果の `words` か、エラーの `error`（`key` と、行が決まるときは `line`）です。`write` は、`words` を書き出した文字列 `csv` です。
TS は `tests/delimited.test.cjs`、Go は `server/internal/workspace/delimited_test.go` が読みます。

次の2つは TS と Go で答えが違うので、ここに入れていません。

- 1行に複数の誤りがあるとき: TS は `input_type` を先に、Go は空欄と長さを先に検査します。
- 単語が0個の書き出し: TS は見出しのあとに空行が1つ付き、Go は付きません。
