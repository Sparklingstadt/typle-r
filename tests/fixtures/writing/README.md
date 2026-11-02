# Writing の照合 共通 fixture

`match.json` は配列で、1 要素が 1 ケースです。形は次のとおりです。

```json
{ "description": "...", "candidates": ["認識の候補"], "target": "リストの display", "language": "zh-Hans", "options": { "ignoreAccents": true, "ignoreCase": true }, "expected": true }
```

`matchesWriting(candidates, target, language, options)` の結果が `expected` と一致します。`options` の項目は省略できます。
TS は `tests/writing.test.cjs`、iPad / Mac の TypleCore のテストが同じファイルを読みます。Go は読みません。

## 守る約束

- 両方を NFC にし、前後の空白を除いて、続く空白を 1 つにする。`ja`・`zh-Hans`・`zh-Hant` は空白をすべて除く。
- 目標の文字ごとに、候補を前から読む。1 文字が合う（`ignoreAccents`・`ignoreCase` はタイピングと同じ）か、`ignoreAccents` で ß が ss、キリル文字がラテン字の対応表のとおりに合えば進む。
- 候補の最後まで読み終えたら一致。候補のどれか 1 つが一致すれば true、候補が空なら false。
