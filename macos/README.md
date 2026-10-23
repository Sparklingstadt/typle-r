# Typle for Mac（SwiftUI）

Typle の macOS 版です。Web 版（`src/`）と同じ画面・判定・記録・ベストの規則で、Mac のキーボードで練習できます。アカウントの保存先は、Web 版・iPad 版・Android 版・Windows 版と同じ Go のバックエンド（本番の `/api/auth/*`・`/api/workspace`）です。

iPad 版（`ios/`）の SwiftUI のコードと共通の規則（`ios/TypleCore`）をそのまま使い、Mac で違うところだけをこのフォルダーに置いています。そのため、iPad 版で直したことは Mac 版にも入ります。

## 必要なもの

- macOS 14（Sonoma）以上の Mac
- ビルドするとき: Xcode 16 以上と [XcodeGen](https://github.com/yonaskolb/XcodeGen)（`brew install xcodegen`）

## 入れ方

v0.70.0 で GitHub Actions のワークフローを削除したため、アプリは Xcode で `macos/` を開いて作ります。

1. `Typle-macOS.zip` を開いて、`Typle.app` を「アプリケーション」に移します。
2. Apple の公証（notarization）を受けていないため、初回は Finder で `Typle.app` を Control キーを押しながらクリックして「開く」を選びます（macOS 15 以降は、一度開こうとした後で「システム設定」→「プライバシーとセキュリティ」の「このまま開く」）。
3. ターミナルで `xattr -dr com.apple.quarantine /Applications/Typle.app` を実行しても開けるようになります。

App Store には出していません。

自分でビルドするときは次のとおりです。

```sh
cd macos
xcodegen generate      # project.yml から Typle.xcodeproj を作る（コミットしない）
open Typle.xcodeproj
```

開いたウインドウのタイトルが `macos/Typle.xcodeproj` であることを確かめ、実行先を「My Mac」にして ⌘R で実行します。署名は「Sign to Run Locally」（アドホック署名）にしてあるので、Team を選ばなくても起動できます。自分の証明書で署名したいときは、「Signing & Capabilities」で Team を選びます。

iPad 版のプロジェクト（`ios/Typle.xcodeproj`）を「My Mac (Designed for iPad)」で動かしたものは Mac 版ではありません（Team も要ります）。

Xcode は同じローカルの Swift Package（`ios/TypleCore`）を2つのプロジェクトで同時に開けません。「Missing package product 'TypleCore'」や「Couldn't load TypleCore because it is already opened from another project or workspace」と出たら、iPad 版のウインドウ（`ios/Typle.xcodeproj`）を閉じてから、File → Packages → Resolve Package Versions を実行してください。

## 見た目と操作

Web 版と同じ画面構成・色・部品です。上部バー（ブランド・保存先・ライト／ダーク・アカウント）、ウインドウの幅が 1280pt 以上ならサイドバー、それより狭ければメニューボタンで開くドロワー。色と角丸は iPad 版と同じく `src/app/globals.css` の値（`ios/Typle/Design/Theme.swift`）です。

| 操作 | 内容 |
|---|---|
| ⌘1〜⌘6 | メニューの「移動」から、ホーム・練習する・練習記録・ベスト記録・単語リスト・端末へ |
| ⌘N | リストを作成 |
| ⌘, | 一般（表示言語・保存先・ログイン） |
| Esc | 練習のやり直し |
| Return | 結果画面でもう一度 |
| ⌘Return | 単語リストの編集で保存 |
| 任意のキー | 練習欄の外をクリックした後、練習欄に戻る（Web 版と同じく、そのキーは入力しません） |

- 練習欄は AppKit の `NSTextField` で、自動修正・スペルチェック・自動置換・入力候補（インライン予測）・取り消し・ペースト・ドロップを使えません。変換中（日本語・中国語の入力など）の文字は判定せず、確定した文字だけを判定します。
- 単語リストの「CSV で書き出す」は、保存先を選ぶ画面で書き出します（iPad は共有シート）。取り込みはファイルを選ぶ画面から行います。
- ガイド・Typleについては、メニューの「ヘルプ」とサイドバーから Web 版を開きます。

## 保存先

| 保存先 | 内容 |
|---|---|
| この Mac（既定） | アプリのコンテナーの Application Support の `workspace.json`。形は Web 版のブラウザー保存と同じです。読めないファイルは上書きしません |
| アカウント（GitHub） | Web 版の Typle（既定は本番の `https://typle-r-six.vercel.app`）に GitHub でログインし、Web 版と同じアカウントの単語リスト・記録・端末を、Go のバックエンドの `/api/workspace` で読み書きします |

- 2つのデータは別々で、切り替えてもコピーしません。
- アカウントでも、この Mac と同じくすべての操作ができます。変更のたびに、読み込んだときの `revision` を付けてデータ全体を保存します。別の画面で先に保存されていたとき（`409 conflict`）は、最新を読み直して同じ変更をやり直します（3回まで）。
- ログインは「一般」の「GitHub でログイン」で、システムのログイン画面（`ASWebAuthenticationSession`。Safari の GitHub のログインを使えます）が開きます。サーバーには `client=macos` で始め、流れは iPad と同じです（[README の「iPad と Mac と Android と Windows のログイン」](../README.md#ipad-と-mac-と-android-と-windows-のログイン)）。受け取ったトークンは Mac のキーチェーンにだけ保存し、有効期限は30日です。使っているあいだは自動で延びます。
- ログアウトするとトークンを消して「この Mac」に戻ります。
- サーバーの URL は https だけです。http は `localhost`・`127.0.0.1`・`*.local` に限ります。手元の Web 版（`npm run dev`）で試すときは `http://localhost:<ポート>` を入れます。GitHub の OAuth App の callback URL がサーバー（`AUTH_URL`）のものである必要があり、開発用ログインはアプリでは使えません。
- アプリは App Sandbox の中で動き、使う権限はネットワークへの接続と、自分で選んだファイルの読み書きだけです（`Typle/Typle.entitlements`）。

## 構成

| 場所 | 内容 |
|---|---|
| `../ios/Typle/` | iPad 版と共通の SwiftUI のコード。Mac で違うところは `#if os(macOS)` と `Support/Platform.swift`（ログインの `client`、保存データの名前など）、`Design/Theme.swift` の「The iPad and the Mac」（入力欄・メニュー・シートの見た目） |
| `../ios/TypleCore/` | 入力判定・記録・ベスト・ランキング・単語リスト・端末・CSV と、最初の単語リスト |
| `Typle/Practice/PracticeTextField.swift` | 練習欄（AppKit）。iPad の `UITextField` の代わりで、名前と引数は同じです |
| `Typle/MacCommands.swift` | メニューバー、CSV の保存、スクリーンショット（Debug ビルドだけ） |
| `Typle/Resources/` | アイコンと、iPad の文言のうち「iPad」「タップ」を含むものの Mac 版（`Mac.strings`）。ほかの文言は iPad 版の `Localizable.strings` を使います |
| `project.yml` | XcodeGen の設定 |

## 確認

- CI のワークフローはありません（v0.70.0 で削除）。Mac 向けのビルドとサンプルデータ（`-TypleDemo YES`）での確認は手元で行います。文言は `npm test`（`tests/macos.test.cjs`）が確かめます。
- `npm test` の `tests/macos.test.cjs` が、「iPad」「タップ」を含む文言すべてに Mac 版があり、プレースホルダーがそろっているか、Mac のコードが使う文言が日本語・英語の両方にあるか、Mac の練習欄の引数が iPad のものと同じかを確かめます。
- 共通の規則は `cd ios/TypleCore && swift test` で確かめます。

## 範囲外

App Store への公開・Apple の公証・自動更新、日本語・英語以外の言語、複数のウインドウ、保存先の間のコピー。
