# macOS 版 設計

日付: 2026-10-22

## 目的

Web 版と同じ画面・規則の Mac のネイティブアプリ（SwiftUI）を作る。アカウントの保存先は Web 版・iPad 版・Android 版と
同じ Go のバックエンド（本番の `/api/auth/*`・`/api/workspace`）にする。

## 決めたこと

- iPad 版（`ios/Typle`・`ios/TypleCore`）のコードをそのまま Mac でもビルドする。画面は iPad 版の時点で Web 版に
  そろえてあるので、別に書き直すと同じものが 2 つになり、片方だけ直す食い違いが起きるため。
- Mac で違うところは小さく保つ。共有のコードでは `#if os(macOS)` と `Support/Platform.swift`、見た目の差は
  `Design/Theme.swift` の補助（`plainInput`・`plainMenu`・`menuPicker`・`sheetSize`）にまとめる。Mac だけの部品は
  `macos/Typle/` に置く。
- 練習欄は AppKit の `NSTextField` で作り直す（`UITextField` は使えない）。自分の field editor（`NSTextView`）を
  持たせ、変換中（marked text）の文字は判定しない、ペースト・ドロップ・自動修正・補完・取り消しを使わない、Esc で
  やり直し、Return は何もしない。input method の呼び出し中に起きた変更は、呼び出しが終わってから 1 回だけ伝える
  （途中の状態ではまだ marked text になっていないことがあるため）。練習欄の外をクリックした後は、Web 版と同じく
  印字できるキーか Return で練習欄に戻り、そのキーは入力しない。
- 文言は iPad の `Localizable.strings` を使い、「iPad」「タップ」を含むものとメニューだけを `Mac.strings` に置く。
  `L()` は Mac では `Mac.strings` を先に引く。`tests/macos.test.cjs` が抜けを確かめる。
- ログインはサーバーの `client` に `macos` を足すだけで、流れ（PKCE、`typle-r://login`、`POST /api/auth/token`、
  Bearer トークン）は iPad と同じ。ログイン画面は `ASWebAuthenticationSession`、トークンはキーチェーン。
- ウインドウは 1 つ。⌘N は新しいウインドウではなく「リストを作成」、⌘, は一般、⌘1〜⌘6 で各ページへ。CSV の書き出しは
  保存先を選ぶ画面（`NSSavePanel`）。
- App Sandbox（ネットワークへの接続、選んだファイルの読み書き）。配布は CI がアドホック署名で作る zip で、App Store・
  公証は範囲外。

## 確かめ方

- `.github/workflows/macos.yml`（`macos/`・`ios/` を変えた PR と手動）：Debug のビルド、サンプルデータでの各ページの
  スクリーンショット（アプリが自分のウインドウを PNG に描く `-TypleSnapshot`）、Release のユニバーサルなアプリ。
- `.github/workflows/ios.yml`：共有のコードを変えても iPad のビルドとスクリーンショットが変わらないこと。
- `go test ./server/...`：`client=macos` のログインが iPad と同じに完了すること、悪いチャレンジを断ること。
