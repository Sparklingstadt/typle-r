# iPadOS 版（SwiftUI） 設計

- 日付: 2026-10-20
- 対象バージョン: v0.43.0
- 前提: Web 版（Next.js）の `src/core` のモデルと、v0.42.0 の API（Go、`docs/api.md`）

## 目的

Typle を iPad のネイティブアプリ（SwiftUI）として使えるようにする。Magic Keyboard などのハードウェアキーボードとソフトウェアキーボードのどちらでも、Web 版と同じ判定・記録で練習できる。

## 決定事項

| 項目 | 決定 |
|---|---|
| 場所 | `ios/`。Web 版（`src/`）と Go API（`server/`）は変更しない |
| 対象 | iPadOS 17 以上、iPad のみ（`TARGETED_DEVICE_FAMILY = 2`）。Swift 5 モード |
| プロジェクト | XcodeGen（`ios/project.yml`）。`.xcodeproj` はコミットせず、`xcodegen generate` で作る |
| 構成 | `ios/TypleCore`（Swift Package。Foundation だけに依存するモデルと規則）と `ios/Typle`（SwiftUI のアプリ）。依存は app → core の一方向 |
| 判定・記録 | `src/core` の `typing.ts`・`records.ts`・`wordLists.ts`・`devices.ts`・`rankings.ts`・`listOverview.ts` と同じ規則を Swift に移す。文字は JavaScript の `Array.from` と同じくコードポイント（`unicodeScalars`）で数える |
| 保存先 | 「この iPad」（既定）と「アカウント（API）」の2つ。データは分離し、自動でコピーしない（Web 版のブラウザー保存とアカウントと同じ） |
| この iPad | Application Support の `workspace.json`。形は Web 版のブラウザー保存（`{ version: 1, accountId, revision, lists, devices }`）と同じで、`accountId` は `ipad:local`。読めないファイルは上書きせずエラーを出す |
| アカウント（API） | v0.42.0 の Go API を `-writable` で起動し、HTTPS で公開したサーバーの URL と GitHub のトークンを設定で入れる。トークンは Keychain に保存する |
| API でできること | 読み込み、リストの作成・変更・削除・複製、記録の追加（`id` を付けて送るので、やり直しても増えない）。端末は API が読み取りだけのため、選べるが追加・変更・削除はできない。記録の削除もできない |
| 最初のリスト | `src/plugins/packs` のサンプルと国名193か国を `TypleCore` のリソースにコピーする。Node のテストでコピーが元と同じか確かめる |
| 言語 | 日本語と英語（`Localizable.strings`）。ほかの4言語は範囲外 |
| 確認 | `.github/workflows/ios.yml`（macOS）で `swift test`（TypleCore）と、iOS シミュレーター向けの `xcodebuild build`。`ios/` を変えた PR と main への push で動く。リリース・デプロイ（`ci.yml`）には関わらない |

## 画面

サイドバー（`NavigationSplitView`）に 練習・単語リスト・記録・ランキング・端末・設定 を並べる。

- 練習: リストの切り替え（検索つきのシート。練習中は確認する）、端末の選択（練習中は固定）、ライブ指標（経過・速度・正確率・ミス）の表示切り替え、やり直し（ボタンと Esc）、進み具合、注記、表示と入力の文字の色分け、次の単語、すべての単語、結果（所要時間・正確率・ミス・速度・ベストとの比較・保存の状態と再試行）、右側にベスト記録5件。
- 入力欄は `UITextField` を包む。変換中（`markedTextRange` があるとき）は判定せず、確定した文字だけを判定する（Web 版の `compositionstart`／`compositionend` と同じ）。自動修正・自動大文字・スマート句読点・予測・貼り付けは無効にする。
- 単語リスト: 一覧（検索・並び替え）、作成・編集（名前と単語の行の追加・削除・並べ替え）、CSV・TSV の取り込み、CSV の書き出し（共有シート）、複製、削除。
- 記録: 新しい順に日ごとにまとめ、リストと端末で絞り込む。この iPad の記録は削除できる。
- ランキング: リストごとの順位（正確率順・速さ順）、直近5回の平均。
- 端末: 一覧と使用回数、追加・変更・削除（この iPad のとき）。
- 設定: 保存先、API のサーバーとトークン、接続の確認。

## 範囲外

- ホームのダッシュボード、ガイド、about
- App Store への公開、署名、TestFlight
- オフラインで追加した記録を後で API に送る仕組み（送れなかった記録は結果画面の再試行で送る）
- 保存先の間のコピー、iCloud 同期
- 日本語・英語以外の言語
