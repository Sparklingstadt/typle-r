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
| 練習記録 | 日ごとの一覧、リストと端末での絞り込み、削除 |
| ベスト記録 | リストごとの順位（正確率順・速さ順）、直近5回の平均 |
| 端末 | 練習する端末の選択と使用回数、追加・変更・削除 |
| 一般 | 表示言語、保存先、GitHub のログイン・ログアウト |

- 変換中（日本語・中国語の入力など）の文字は判定せず、確定した文字だけを判定します。自動修正・自動大文字・予測・貼り付けは使えません。
- 表示言語は日本語と英語です。「一般」で選べます（既定は iPad の言語）。

## 保存先

| 保存先 | 内容 |
|---|---|
| この iPad（既定） | アプリの Application Support の `workspace.json`。形は Web 版のブラウザー保存と同じです。読めないファイルは上書きしません |
| アカウント（GitHub） | Web 版の Typle（既定は本番の `https://typle-r-six.vercel.app`）に GitHub でログインし、Web 版と同じアカウントの単語リスト・記録・端末を、Go のバックエンドの `/api/workspace` で読み書きします（v0.56.0 から） |

- 2つのデータは別々で、切り替えてもコピーしません。
- アカウントでも、この iPad と同じくすべての操作ができます。変更のたびに、読み込んだときの `revision` を付けてデータ全体を保存します。別の画面で先に保存されていたとき（`409 conflict`）は、最新を読み直して同じ変更をやり直します（3回まで）。
- ログインは「一般」の「GitHub でログイン」で、システムのログイン画面（`ASWebAuthenticationSession`。Safari の GitHub のログインを使えます）が開きます。流れは [README の「iPad と Android のログイン」](../README.md#ipad-と-android-のログイン) にあります。受け取ったトークンは iPad の Keychain にだけ保存し、有効期限は30日です。使っているあいだは自動で延びます。期限が切れたら、もう一度ログインしてください。
- ログアウトするとトークンを消して「この iPad」に戻ります。ログインしたまま「この iPad」に切り替え、あとで「アカウントに切り替える」で戻ることもできます。
- 同じネットワークの Mac で Web 版を動かして試すときは、`http://<名前>.local:3000` も使えます。それ以外は HTTPS が必要です。GitHub の OAuth App の callback URL がその URL のものである必要があります（開発用ログインは iPad では使えません）。
- v0.55.0 までの「アカウント（API）」（自分で立てる `/api/v1` に GitHub のトークンでつなぐ）はなくなりました。更新後の初回起動で、その設定とトークンを消して「この iPad」に戻ります。

## 構成

| 場所 | 内容 |
|---|---|
| `TypleCore/` | Foundation だけに依存する Swift Package。`src/core` の入力判定・記録・ベスト・ランキング・単語リスト・端末・CSV と、最初の単語リスト（`src/plugins/packs` のコピー）。`swift test` で確認します |
| `Typle/` | SwiftUI のアプリ。`Storage/`（この iPad とアカウント、ログイン）、`Practice/`、`Lists/`、`Records/`、`Devices/`、`Resources/`（文言とアイコン） |
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
