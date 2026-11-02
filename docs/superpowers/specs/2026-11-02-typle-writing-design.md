# Typle Writing（手書きで単語を書いて覚える）設計

- 日付: 2026-11-02
- 前提: v2.6.11。練習はキーボードで単語の `input` を入力するタイピングだけで、記録（`records`）はリストごとに時間・ミス・正確率・端末を持つ。Web・iPad・Mac は同じ Go のバックエンドにつなぎ、iPad・Mac は `TypleCore` に `src/core` の規則の Swift 版を持つ

## 目的

単語を手で書いて覚えられるように、タイピングと並ぶ練習のモード「Typle Writing」を足す。練習する人は単語の見本（`display`）を見ながら、1語ずつ手で書き写す。

## 決定事項

| 項目 | 決定 |
|---|---|
| 書き方 | 手書き。`display` を見て書き写す（見本なしで書くモードは作らない） |
| 入力の手段 | 「画面に書く」（キャンバスに書き、アプリが認識する）と「OS の手書き入力」（OS が文字に変換して入力欄に入れる）の2つ |
| 対象のアプリ | Web・iPad・Mac。Web は「OS の手書き入力」だけ、iPad・Mac は両方 |
| 認識 | iPad・Mac の「画面に書く」は、端末の中の Vision（`VNRecognizeTextRequest`）。画像を外へ送らない |
| 判定 | 単語ごと。候補のどれかが `display` と一致すれば正解 |
| 使えるリスト | 作者がリストに印（`writing`）を付けたリストだけ。印には認識する言語を入れる |
| 記録 | 今の `records` に `mode: 'writing'` を付ける。ベスト記録・ダッシュボード・記録の一覧では、タイピングと分ける |
| 手段の記録 | 残さない。どちらの手段も同じ Writing の記録として扱う |

### 入力の手段とアプリ

| アプリ | 画面に書く | OS の手書き入力 |
|---|---|---|
| iPad | ○（Vision。ペン・指） | ○（スクリブルなど） |
| Mac | ○（Vision。トラックパッド・マウス・ペンタブ） | ○（トラックパッドの中国語手書きなど） |
| Web | ×（ブラウザーに標準の手書き認識がないため置かない） | ○（Windows の手書きパネルでのペンタブ・液タブ、Android の手書きキーボード、IME の手書きなど） |

### 検討して採らなかった案

- **スクリブルだけを使う**：文字で受け取れるのでタイピングの判定を使えるが、iPad と Apple Pencil に限られ、Mac と指で書けない。iPad では「OS の手書き入力」の1つとして使える
- **書き順・字形のデータ（KanjiVG など）と線を照合する**：言語ごとのデータと大きな実装が要る
- **Web のキャンバスを Go のバックエンドで認識する**（クラウドの OCR・LLM）：費用、画像の送信、ログインなしでの利用の扱いが増える
- **Web のキャンバスをブラウザー内のモデルで認識する**：言語ごとに数十MBになり、精度の検証も要る

## 範囲外

- **スマホ（iPhone・Android）を対象にすること（将来含める）**。Web の「OS の手書き入力」は今の作りのままスマホのブラウザーでも動く見込みだが、狭い画面に合わせた練習画面と動作の確認はそのときに行う
- Web のキャンバスでの手書き
- 書き順・字形の採点
- 見本なしで書くモード（意味から書く）
- Vision の `customWords` で認識の候補を正解に寄せること（違う字でも正解になるおそれがある）
- 練習した入力の手段（キャンバスか OS か）を記録に残すこと
- 公式パックへの印付け（別の PR で行う）

## データ

### リストの印

```ts
// src/core/wordLists.ts
export type WritingLanguage = 'en' | 'ja' | 'zh-Hans' | 'zh-Hant' | 'ko' | 'fr' | 'de' | 'es' | 'ru' | 'cs'

export type WordList = {
  // ...
  /** Set when the author lets the list be practised by handwriting (Typle Writing). Left out otherwise. */
  writing?: { language: WritingLanguage }
}
```

- `writing` がないリストは Writing に使えない。今あるデータは変わらない
- 言語は認識の手がかりにする。漢字だけでは中国語（簡体・繁体）と日本語を見分けられず、Vision は言語を間違えると精度が落ちるため、作者が選ぶ
  - iPad・Mac：Vision の `recognitionLanguages` に使う
  - Web・iPad・Mac：「OS の手書き入力」の入力欄の `lang` に入れる
- 検証：TS の `validateList` と Go の `rawList` は、`writing` が `{ language }` だけを持ち、言語が上の一覧にあることを確かめる。違えば今のリストの検証エラーと同じ扱い（新しいエラーのキーは `invalidWritingLanguage`）
- Go の `rawList` の `UnmarshalJSON` は、知っている項目に `writing` を足す
- パックのファイル（`.typle-pack.json`）・共有（`typle_shared_packs` の写し）・公式パック（`src/plugins/packs/commands/*.json`）にもそのまま載せる。今の他の項目と同じく、パックを追加（コピー）すると印も写る
- 編集画面（Web の `WordListEditor`、iPad・Mac のリストの編集）に「手書き練習（Typle Writing）に使う」の切り替えと言語の選択を足す。切り替えをオンにしたときの言語の初期値は、表示言語に対応する言語（なければ `en`）

### 記録

```ts
// src/core/wordLists.ts の records と src/core/records.ts の PracticeRecord
mode?: 'writing'   // left out for typing, as before
```

- `time`：最初の線（または最初の入力）から、最後の語が正解になる（または飛ばす）までのミリ秒。止まっている間は含めない
- `mistakes`：「判定」で一致しなかった回数と、「飛ばす」の回数の合計
- `accuracy`：単語数 ÷（単語数 ＋ `mistakes`）× 100
- `wordCount`・`device`：タイピングと同じ
- 検証：`addRecord`（TS）と `workspace.AddRecord`（Go）、記録の変更（`records.go` の change）は、`mode` がないか `'writing'` であることを確かめ、それ以外は `invalidRecord`。記録を変える API では `mode` を変えられない
- Go の `rawRecord` の `UnmarshalJSON` は、知っている項目に `mode` を足す
- `/api/v1` の記録の追加・一覧・ベスト記録にも `mode` を足す（足すだけで、今の呼び出しは変わらない）

### 集計

- ベスト記録（`rankings`）、ホームのダッシュボード（`dashboard.ts`）、リストの概要（`listOverview.ts`）、パックの記録（`packRecords.ts`）は、タイピングの集計から `mode: 'writing'` の記録を除く
- Writing の記録は、別にベスト記録を持つ。ベスト記録の画面に「タイピング／Writing」の切り替えを足す
- 練習記録の一覧では、Writing の記録に「Writing」の印を付ける
- ダッシュボードの「次に練習するリスト」と「リスト別の推移」はタイピングだけで数える（Writing の扱いは使われ方を見て決める）

## 練習の流れ

### 始め方

- 練習画面（Web の `/play`、iPad・Mac の練習）で印の付いたリストを選ぶと、「タイピング／Writing」の切り替えが出る。印のないリストでは出ない
- Writing では、さらに「画面に書く／OS の手書き入力」を選ぶ。Web は「OS の手書き入力」だけで、選ぶ欄は出さない
- 選んだモードと手段は、このブラウザー・端末に保存する（Web は LocalStorage の `typle-r:writing-mode`、iPad・Mac は UserDefaults）。次にそのリストを選んだときも同じものを選んだ状態にする
- 出題の順番・単語数などのオプションは、タイピングと同じものを使う

### 1語の流れ（両方の手段で共通）

1. `display` を大きく、その下に `annotation` を出す（タイピングと同じ）
2. 書く・入力すると時計が動く。フォーカスが外れたとき・アプリが後ろに回ったときは、タイピングの `pauseSession`／`resumeSession` と同じく止める
3. 照合して一致すれば正解。次の語へ進む
4. 「判定」（Enter）を押して一致しなければ、ミスを1つ数え、「〇〇と読めました」（入力欄なら入力した文字）を出して書き直しにする
5. 「飛ばす」はいつでも押せる。ミスを1つ数え、次の語へ進む。認識がどうしても合わないときの逃げ道
6. 最後の語が終わると、タイピングと同じ結果画面に「Writing」の表示を付けて出し、`mode: 'writing'` の記録を保存する

### 照合の規則

`src/core/writing.ts` の `matchesWriting(candidates, target, language, options)` に置き、`TypleCore` に Swift 版を写す。

- 各候補と `display` の両方を、次のとおりそろえてから比べる
  1. NFC で正規化する
  2. 前後の空白を除き、続く空白を1つにする
  3. 言語が `ja`・`zh-Hans`・`zh-Hant` のときは、空白をすべて除く
- 入力の設定（「特殊文字の簡易入力」「大文字・小文字を区別しない」）は、タイピングの `matchesCharacter` と同じ規則で文字ごとに効かせる
- 候補が1つでも一致すれば正解
- Web と Swift の結果がずれないよう、入出力の例を `tests/fixtures/writing` に置き、TS と Swift のテストで同じものを読む（Go は照合しないので読まない）（`tests/fixtures/records` と同じやり方）

### 画面に書く（iPad・Mac）

- SwiftUI の `Canvas` と `DragGesture` で線を集める（`PKCanvasView` は iOS だけなので使わない）。iPad はペンと指、Mac はトラックパッド・マウス・ペンタブで書ける。筆圧が取れれば線の太さに反映する
- 「消す」「1画戻す」を置く。キャンバスは1行の横長で、書く高さの目安の線を引く
- 手を止めて0.8秒たつと、黙って認識する。一致すれば正解。一致しなくてもミスにしない（書いている途中かもしれないため）。ミスを数えるのは「判定」を押したときだけ
- Vision の設定
  - `recognitionLevel = .accurate`
  - `recognitionLanguages = [リストの言語]`
  - `usesLanguageCorrection = false`（別の単語に直されないように）
  - 候補は各行の `topCandidates(5)`。複数の行に分かれたときは、行の順に各行の最上位をつないだものも候補に加える
- 端末の OS がリストの言語を認識できないとき（`supportedRecognitionLanguages()` にないとき）は「画面に書く」を選べなくし、理由を表示して「OS の手書き入力」だけにする
- 認識の処理はメインスレッドの外で行い、前の認識が終わる前に新しい線を書いたら、前の結果は捨てる

### OS の手書き入力（Web・iPad・Mac）

- 入力欄の属性：`lang` はリストの言語、`autocomplete="off"`・`autocorrect="off"`・`autocapitalize="off"`・`spellcheck="false"`
- 入力のたびに照合し、一致すればその場で正解にして入力欄を空にする。IME の変換中（`compositionstart` から `compositionend` まで）は照合しない
- 「判定」（Enter）で一致しなければミスを数える。書き直せるよう、入力欄の文字は残す
- キーボードで打っても入力できるが、区別しない（OS の手書きの変換と見分ける手段がないため）。Writing は書く練習の場として提供し、使い方は練習する人に任せる

## エラーと端の場合

- 練習中にリストの印が外された（別の端末で編集された）とき：その回は最後まで続けられ、記録も保存する。次に選んだときは切り替えが出ない
- 練習中にリストが消されたとき：タイピングと同じく `recordListDeleted`
- 記録の保存に失敗したとき：タイピングと同じ扱い（`SaveNotification`）
- Vision がエラーを返したとき：候補なしとして扱い、「読み取れませんでした」と出す。ミスは「判定」のときだけ数える

## 画面の文言

- 新しい文言は `src/messages/<言語>/` の該当する領域に足し、6言語すべてにそろえる（`tests/i18n.test.cjs`）
- 「Typle Writing」「Writing」はどの言語でも英語のまま表示する

## テスト

- **core（TS、`npm test`）**
  - `matchesWriting`：正規化、空白、言語ごとの空白の除去、入力の設定、複数の候補
  - `validateList`：`writing` の受け付けと、知らない言語・余分な項目の拒否
  - `addRecord`：`mode` の受け付けと、不正な値の拒否
  - 集計：ベスト記録・ダッシュボード・リストの概要・パックの記録で、タイピングと Writing が分かれること
- **Go（`go test ./...`）**：`writing` の検証、`mode` の記録の追加・変更・変更不可、`/api/v1` の応答
- **E2E（Playwright、`npm run test:e2e`）**
  - リストの編集で印を付けると、保存して読み直しても残ること
  - `/play` で Writing を選び、入力欄に `display` を入れると正解で次の語へ進むこと
  - 違う文字を入れて Enter を押すとミスを数えること。「飛ばす」でミスを数えて進むこと
  - `compositionstart`／`compositionend` を送り、変換中は判定しないこと
  - 記録の一覧とベスト記録で、Writing がタイピングと分かれて表示されること
  - 印のないリストでは切り替えが出ないこと
- **iPad・Mac（typle-ipad）**
  - `TypleCore`：同じ `tests/fixtures/writing` を使う照合のテスト
  - 認識：言語ごとに数語の手書きの画像のサンプルを置き、Vision の候補に正解が入るかを確かめるテスト。精度は自動の合格条件にしない
  - リリース前に、実機の Apple Pencil・指（iPad）とトラックパッド（Mac）で書いて確かめる

## 公開の順序

1. **typle-r**：Go・Web・`/api/v1`。1つの PR で、新しい安定版の番号を付ける。リリースの手順は `docs/release-workflow.md` のとおり
2. **typle-ipad**：`TypleCore` の写し、Writing の画面、Vision の認識、リストの編集の印。typle-r の公開の後に出す（古いアプリは `mode` を知らない項目として残すが、Writing の記録をタイピングの集計に混ぜるため、Writing の記録を書くアプリは集計を直した Web・Go より後にする）
3. **公式パックへの印付け**（中国語の HSK など）：別の PR

## 文書の更新

- `docs/features.md` に「Typle Writing」の節を足す
- `api-docs/` の記録とリストの項目に `writing`・`mode` を足す
- 使い方（`/guide`）に Writing の説明を足す
