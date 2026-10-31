---
name: new-word-list
description: typle の新しい単語リストを作る。テーマや元データから単語（display・input・annotation・input_type）を作り、アプリで取り込む CSV／パックファイル（.typle-pack.json）か、リポジトリの公式リスト（src/plugins/packs/commands/*.json）として出力し、アプリと同じコードで検証する。「単語リストを作って」「〇〇のタイピング練習リスト」「公式パックを追加」「CSVを作って取り込みたい」などで使う。
---

# 新しい単語リストを作る

typle のリストの形式は、アプリのコードで決まっています。CSV・TSV は `src/plugins/formats/delimited.ts`、パックファイルは `src/core/packFile.ts`、保存の規則は `src/core/wordLists.ts` を見てください。
出来上がったファイルは、必ず `scripts/word-list.cjs` で検証します。このスクリプトはアプリと同じコードで読み込むので、ここで通ればアプリでも同じように読み込めます。
ユーザーへの出力は日本語で行います。

## 1. 何を作るかを決める

次の3つが依頼から分からなければ、ユーザーに聞きます。

| 出力 | 使いどころ | 置き場所 |
|---|---|---|
| **CSV**（既定） | アプリでリストを編集中に「CSV・TSVを読み込む」で取り込む。1リスト分 | スクラッチパッド、またはユーザーが指定した場所 |
| **パックファイル** `<パック名>.typle-pack.json` | パック（複数のリスト）をまとめて取り込む | 同上 |
| **公式リスト** | 全利用者がフォローできる公式パックに加える（リポジトリの変更） | `src/plugins/packs/commands/` |

あわせて、次のことを決めます。

- テーマ
- 語数：1リストは40語が目安です。上限は1,000語です。
- 対象のレベル
- 表示する文字と入力する文字：たとえば、漢字を表示してローマ字で打つのか、表示したとおりに打つのか。
- 補足の書き方
- 元データ：ユーザーが提供したCSV・表があるか。

## 2. 単語を作る

1語は次の4つの項目でできています。

| 項目 | 内容 | 規則 |
|---|---|---|
| `display` | 画面に大きく表示する文字列 | 必須。1,000文字まで |
| `input` | 実際に打つ文字列 | 必須。1,000文字まで。空白も含めて、書いたとおりに比べられる |
| `annotation` | 単語の上に出す補足 | 省略できる。2,000文字まで。空にしないほうが練習しやすい |
| `input_type` | `word`（単語）・`command`（コマンド）・`code`（コード） | 省略すると `word` |

- **`display` と `input` が同じとき**：打つ文字列だけを表示します（コマンドや英単語など）。
- **`input_type: code` のとき**：`display` は改行やインデント付きで表示し、`input` だけを打たせます。
  - 入力欄は1行なので、`input` は改行もタブもない1行にします。
  - 1行にする規則（言語ごとの `;` の入れ方、`//` を `/* */` に置き換えることなど）は `docs/word-list-sources.md` に合わせます。
- **入力しにくい文字**：押すキーの名前（`Esc`・`Ctrl + C`・`↑` など）は `input` にしません。
- **重複**：1リストの中で `input` が同じ語を作りません。
- **補足の形式**：既存の公式リストに合わせます。
  - コマンド・構文：「用途：できること」（例：`ls -la` → 「ls（List）：ファイル・フォルダの一覧表示」）
  - 語学：「入力 / 日本語訳」（例：`zkušenost / 経験`）
- **正確さ**：コマンドや構文は、実在して正しく動くものだけにします。確かめられないものは入れず、そのことをユーザーに伝えます。
- **元データがあるとき**：内容を書き換えません。除いた行や変えた行は、理由と一緒に報告します。

単語はまず JSON の配列に書きます。CSV を手で書くと引用符を間違えやすいからです。`input` を省略すると `display` と同じ文字列になります。

```json
[
  { "display": "東京", "input": "toukyou", "annotation": "日本の首都" },
  { "display": "git status", "annotation": "状態確認：変更されたファイルを表示する", "input_type": "command" }
]
```

## 3. 出力して検証する

コマンドはリポジトリのルートで実行します。`S=.claude/skills/new-word-list/scripts/word-list.cjs` と置いて使います。

### CSV
```sh
node $S csv words.json <出力先>.csv
```
- アプリの CSV エクスポートと同じ形で書き出します。BOM 付き UTF-8、全セルを `"` で囲み、`input_type` の列が付きます。
- 書き出したあと、そのまま検証も行います。
- TSV がほしいと言われた場合でも、アプリは CSV を読み込めるので CSV を勧めます。

### パックファイル
```sh
node $S pack pack.json <パック名>.typle-pack.json
```
`pack.json` は次の形です。

```json
{ "pack": { "name": "…", "description": "…", "category": "…", "tags": ["…"] },
  "lists": [ { "name": "…（初級）", "levels": ["初級"], "words": [ … ] } ] }
```
- `description`、`category`、`tags` は省略できます。
- リストのレベルは1つです。
- カテゴリーとタグは各50文字、タグは20個までです。

### 検証だけ行う
```sh
node $S check <ファイル>...
```
- `.csv`・`.tsv`・`.typle-pack.json`・公式リストの `.json` を、拡張子で見分けます。
- 結果の読み方
  - `NG`：アプリが読み込みを拒むエラーです。必ず直します。
  - `注意`：読み込めますが練習しにくい点です（重複、補足が空、40語を超える、前後の空白など）。直すか、そのままにする理由をユーザーに伝えます。

## 4. 公式リストとして追加する場合

前例として `git show 0afa79e` を参照してください。チェコ語中級と HSK5級・HSK6級を追加したコミットです。

1. **1リストを1ファイルにする**：`src/plugins/packs/commands/<id>.json` に置きます。`id` はファイル名と同じにします。キーは次の順に並べます。
   ```json
   { "id": "rust-syntax-beginner", "name": "Rust構文（初級）", "category": "プログラミング", "tags": ["Rust"],
     "group": "Rust構文", "levels": ["初級"], "words": [ … ], "records": [], "createdAt": "<追加日>T00:00:00.000Z" }
   ```
   - **パックのまとまり**：`group` が同じリストが1つのパックになり、`group` がパック名になります。`group` を書かないリストは、1つで1パックです。
   - **`category`**：既存のもの（`プログラミング`、`語学` など）に合わせます。
   - **`input_type`**：省略せず、全語に書きます。
   - **分け方**：40語を超えるときは、40語以下のリストに均等に分けます。打ちやすい語から順に並べます（記号と日本語は2文字として数えます）。`levels` の名前は次のとおりです。
     - 2つに分けるとき：`初級`・`上級`
     - 3つ：`初級`・`中級`・`上級`
     - 4つ：`初級`・`中級1`・`中級2`・`上級`
     - 5つ：`初級1`・`初級2`・`中級`・`上級1`・`上級2`
     - 語学のリストは `中級単語` や `単語1` のように内容で名付けることもあります。
2. **並び順に加える**：`src/plugins/packs/commands/manifest.json` の末尾にファイル名を足します。
3. **生成する**：`npm run packs:generate` を実行します。`commands/index.ts` と Go 用のコピー（`server/internal/workspace/packs/`）ができます。
4. **検証する**：`node $S check src/plugins/packs/commands/<id>.json`
5. **テストの数を更新する**
   - `tests/commands.test.cjs`
     - 「the initial lists decode…」の一覧の末尾に `['<id>', [語数]]` を足します。
     - リストを分けたときは、`grouped.length` の数も直します。
     - 語学以外のリストは、input が ASCII であることなどを確かめる規則に従います。従えないときは、その規則の例外一覧（`japanese` や `leveled` など）に足します。
   - `tests/packCatalog.test.cjs`：`official.length`（公式パックの数）
   - `tests/listGroups.test.cjs`：`entries.length` と `groups.length`
   - `server/internal/workspace/follow_test.go`：`len(official)` とリストの数 `count`、そのコメント
   - 新しいパックの構成（パック名、カテゴリー、タグ、リストの id と levels、語数）を確かめるテストを足します。語学なら `tests/languagePacks.test.cjs` に置きます。
6. **出典を書く**：元データがあれば、出典・作り方・確かめ方を `docs/word-list-sources.md` に書き足します。
7. **確かめる**：`npm test` と `go test ./server/internal/workspace/...` を実行します。
8. **公開する**：`docs/release-workflow.md` に従います。
   - `npm version <X.Y.Z> --no-git-tag-version` で `package.json` と `package-lock.json` のバージョンを上げます。単語パックの追加はマイナーバージョンです（前例は v2.4.0・v2.5.0）。
   - 変更履歴は GitHub Releases に自動で作られるので、`CHANGELOG.md` には書きません。
   - PR で出します。main には直接 push しません。

## 5. 報告する

最後に次のことを報告します。

- 作ったファイルのフルパス
- 語数（リストに分けたときはリストごと）
- 検証の結果（`注意` が残っていれば、その内容）
- 除いた語や、確かめられなかった語
- 取り込み方
  - CSV：リストの編集画面で「CSV・TSVを読み込む」を押し、末尾に追加するか置き換えるかを選びます。
  - パックファイル：単語パックの画面の「ファイルから取り込む」で選ぶと、新しいパックとして取り込まれます。
