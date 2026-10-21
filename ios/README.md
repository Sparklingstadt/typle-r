# Typle for iPad（SwiftUI）

Typle の iPadOS 版です。Web 版（`src/`）と同じ判定・記録・ベストの規則で、Magic Keyboard などのハードウェアキーボードでも、ソフトウェアキーボードでも練習できます。設計は `docs/superpowers/specs/2026-10-20-ipad-app-design.md` にあります。

## 必要なもの

- Xcode 16 以上を入れた Mac
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)（`brew install xcodegen`）
- iPadOS 17 以上の iPad、またはシミュレーター

## 起動

```sh
cd ios
xcodegen generate      # project.yml から Typle.xcodeproj を作る（コミットしない）
open Typle.xcodeproj
```

Xcode で「Signing & Capabilities」の Team を自分のものにして、iPad を選んで実行します。バンドルIDは `project.yml` の `PRODUCT_BUNDLE_IDENTIFIER` です。ほかのアカウントと重なるときは変えてください。

## 見た目

Web 版と同じ画面構成・色・部品です。上部バー（ブランド・保存先・ライト／ダーク・アカウント）、幅が 1280pt 以上ならサイドバー、それより狭ければメニューボタンで開くドロワー。色と角丸は `src/app/globals.css` の値を `Typle/Design/Theme.swift` に写しています。表示言語（日本語・English）は「一般」でその場で切り替えられます。

`.github/workflows/ios.yml` は、サンプルデータ（`-TypleDemo YES`、`Typle/Support/DemoData.swift`）で各ページをシミュレーターに表示してスクリーンショットを撮り、成果物 `ipad-screenshots` に残します。Web 版と見比べるときに使います。

## できること

| 画面 | 内容 |
|---|---|
| ホーム | 今週のまとめ（練習回数・連続練習・平均正確率・練習時間）、次に練習するリスト、リスト別の推移 |
| 練習 | リストの切り替え、端末の選択、ライブ指標、やり直し（ボタンと Esc）、表示と入力の色分け、次の単語・すべての単語、結果とベストとの比較、ベスト記録5件 |
| 単語リスト | 検索・並び替え、作成・編集のページ（単語の追加・削除・ドラッグや「…」での並べ替え、入力する文字が空欄なら表示と同じ）、CSV・TSV の取り込み、CSV の書き出し、複製、削除 |
| 練習記録 | 日ごとの一覧、リストと端末での絞り込み、削除（この iPad のとき） |
| ベスト記録 | リストごとの順位（正確率順・速さ順）、直近5回の平均 |
| 端末 | 練習する端末の選択と使用回数、追加・変更・削除（この iPad のとき） |
| 一般 | 表示言語、保存先、API の接続 |

- 変換中（日本語・中国語の入力など）の文字は判定せず、確定した文字だけを判定します。自動修正・自動大文字・予測・貼り付けは使えません。
- 表示言語は日本語と英語です。「一般」で選べます（既定は iPad の言語）。

## 保存先

| 保存先 | 内容 |
|---|---|
| この iPad（既定） | アプリの Application Support の `workspace.json`。形は Web 版のブラウザー保存と同じです。読めないファイルは上書きしません |
| アカウント（API） | [API（Go）](../docs/api.md) を `-writable` で起動し、HTTPS で公開したサーバーにつなぎます。GitHub の Fine-grained の個人用アクセストークン（`github_pat_`、権限なしで十分。ほかの種類のトークンは使えません）は iPad の Keychain に保存します |

- 2つのデータは別々で、切り替えてもコピーしません。
- API ではリストの作成・変更・削除・複製と記録の追加ができます。端末は選べますが変更できず、記録の削除もできません（API が対応していないため）。Web 版で行ってください。
- 記録は ID を付けて送るので、保存に失敗して再試行しても二重になりません。
- 同じネットワークの Mac で API を試すときは、`http://<名前>.local:8080` も使えます（`-addr 0.0.0.0:8080` で起動）。それ以外は HTTPS が必要です。

## 構成

| 場所 | 内容 |
|---|---|
| `TypleCore/` | Foundation だけに依存する Swift Package。`src/core` の入力判定・記録・ベスト・ランキング・単語リスト・端末・CSV と、最初の単語リスト（`src/plugins/packs` のコピー）。`swift test` で確認します |
| `Typle/` | SwiftUI のアプリ。`Storage/`（この iPad と API）、`Practice/`、`Lists/`、`Records/`、`Devices/`、`Resources/`（文言とアイコン） |
| `project.yml` | XcodeGen の設定 |

文字は JavaScript の `Array.from` と同じくコードポイントで数えるため、Web 版と同じ入力が同じミス数・正確率になります。

## 確認

```sh
cd ios/TypleCore && swift test
```

- `.github/workflows/ios.yml` が、`ios/` を変えた PR と main への push で、macOS 上の `swift test` と iPad シミュレーター向けのビルドを行います。Web 版のリリース・デプロイ（`ci.yml`）とは別です。
- `npm test` の `tests/ios.test.cjs` が、最初の単語リストのコピーが元と同じか、使っている文言が日本語・英語の両方にあり、プレースホルダーがそろっているかを確かめます。`src/plugins/packs` を変えたら `TypleCore/Sources/TypleCore/Resources` にコピーしてください。

## 範囲外

ガイド・Typleについて（Web 版を開きます）、日本語・英語以外の言語、App Store・TestFlight への公開、保存先の間のコピー。
