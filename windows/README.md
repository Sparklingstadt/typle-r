# Typle for Windows（C#・WinUI 3）

Typle の Windows 11 版です。Web 版（`src/`）・iPad 版（`ios/`）・Android 版（`android/`）と同じ判定・記録・ベストの規則で、パソコンのキーボードで練習できます。設計は `docs/superpowers/specs/2026-10-22-windows-app-design.md` にあります。

## 必要なもの

- Windows 11（Windows 10 1809 以上でも動きます）。x64
- ビルドするとき: .NET 10 SDK（Visual Studio は要りません）

Windows App SDK と .NET を同梱した（self-contained）アプリなので、Windows App SDK のランタイムを別に入れる必要はありません。

## 入れ方

GitHub Actions の `Windows app` ワークフローが、`windows/` を変えた PR と手動の実行（Actions の「Run workflow」）のたびにアプリを作り、成果物 `typle-windows-x64` に残します。main のアプリが欲しいときは、main で手動実行します。ダウンロードした zip を好きなフォルダーに展開し、`Typle.exe` を開きます。Microsoft Store には出しておらず、署名もしていないため、初回に SmartScreen の確認が出たら「詳細情報」→「実行」で開きます。

自分でビルドするときは次のとおりです。

```powershell
dotnet publish windows/Typle/Typle.csproj -c Release -r win-x64 -p:Platform=x64 -o windows/publish
windows/publish/Typle.exe
```

## 見た目

Web 版と同じ画面構成・色・部品です。上部バー（ブランド・保存先・ライト／ダーク・アカウント）、幅に応じたサイドバー（幅が 1100 px 未満ならメニューボタンで開きます）、カード。色と角丸は `src/app/globals.css` の値を `Typle/Support/Palette.cs` に写しています。アイコンは Windows 11 の Segoe Fluent Icons です。表示言語（日本語・English）は「一般」でその場で切り替えられます。

画面は XAML ファイルを使わず、C# で WinUI のコントロールを組み立てています（`Typle/Support/Ui.cs` が Web 版の Card・Button・Badge などにあたります）。そのため、アプリ全体を Linux や macOS でもコンパイルして確かめられます（実行は Windows だけです）。

`.github/workflows/windows.yml` は、サンプルデータ（起動引数 `--demo`、`Typle/Demo.cs`）で各ページを表示してスクリーンショットを撮り、ログと成果物 `windows-screenshots` に残します（`ci/screenshots.ps1`）。`--demo` は一時フォルダーのデータだけを使い、このパソコンの保存データには触れません。

## 外部キーボードで練習する

- 練習欄では予測入力・スペルチェック・貼り付けを使えません。変換中（日本語・中国語の入力など）の文字は判定せず、確定した文字だけを判定します。
- Esc でやり直し、結果画面では Enter でもう一度、単語リストの編集では Enter で次の欄、Ctrl+Enter で保存、Alt+↑↓ で単語の並べ替えです。
- 英字の単語リストは、IME をオフ（半角英数）にして打ってください。

## できること

| 画面 | 内容 |
|---|---|
| ホーム | 今週のまとめ（練習回数・連続練習・平均正確率・練習時間）、次に練習するリスト、リスト別の推移 |
| 練習 | リストの切り替え、端末の選択、ライブ指標、やり直し（ボタンと Esc）、表示と入力の色分け、次の単語・すべての単語、結果とベストとの比較、ベスト記録5件 |
| 単語リスト | 検索・並び替え、作成・編集のページ（単語の追加・削除・「…」と Alt+↑↓ での並べ替え、入力する文字が空欄なら表示と同じ）、CSV・TSV の取り込み、CSV の書き出し（保存先を選んで保存）、複製、削除 |
| 練習記録 | 日ごとの一覧、リストと端末での絞り込み、削除 |
| ベスト記録 | リストごとの順位（正確率順・速さ順）、直近5回の平均、推移のグラフ |
| 端末 | 練習する端末の選択と使用回数、追加・変更・削除 |
| 一般 | 表示言語、保存先、GitHub のログイン・ログアウト |

## 保存先

| 保存先 | 内容 |
|---|---|
| このパソコン（既定） | `%LOCALAPPDATA%\Typle\workspace.json`。形は Web 版のブラウザー保存と同じです。読めないファイルは上書きしません |
| アカウント（GitHub） | Web 版の Typle（既定は本番の `https://typle-r-six.vercel.app`）に GitHub でログインし、Web 版と同じアカウントの単語リスト・記録・端末を、Go のバックエンドの `/api/workspace` で読み書きします |

- 2つのデータは別々で、切り替えてもコピーしません。
- アカウントでも、このパソコンと同じくすべての操作ができます。変更のたびに、読み込んだときの `revision` を付けてデータ全体を保存します。別の画面で先に保存されていたとき（`409 conflict`）は、最新を読み直して同じ変更をやり直します（3回まで）。
- ログインは「一般」の「GitHub でログイン」で、既定のブラウザーが GitHub のログインを開きます。終わるとブラウザーが `typle-r://login?code=…` を開いてよいか尋ねるので、許可すると Typle に戻り、コードをトークンに替えます。流れは [README の「iPad と Android と Windows のログイン」](../README.md#ipad-と-android-と-windows-のログイン) にあります。ログインを始めてから10分を過ぎたコールバックは受け付けません。
- `typle-r` のプロトコルは、Typle が起動のたびにこの Windows ユーザーに登録します（`HKEY_CURRENT_USER\Software\Classes`）。Typle を別のフォルダーに移したら、一度開いてからログインしてください。
- 受け取ったトークンは Windows のデータ保護（DPAPI、この Windows ユーザーの鍵）で暗号化して `%LOCALAPPDATA%\Typle\token.dat` に保存し、有効期限は30日です。使っているあいだは自動で延びます。期限が切れたら、もう一度ログインしてください。
- ログアウトするとトークンを消して「このパソコン」に戻ります。ログインしたまま「このパソコン」に切り替え、あとで「アカウントに切り替える」で戻ることもできます。
- サーバーの URL は https だけです。http は `localhost`・`127.0.0.1`・`*.local` に限ります。同じパソコンの Web 版（`npm run dev`）で試すときは `http://localhost:<ポート>` を入れます。GitHub の OAuth App の callback URL がサーバー（`AUTH_URL`）のものである必要があり、開発用ログインはアプリでは使えません。
- 設定（表示言語・テーマ・保存先・端末の選択など）は `%LOCALAPPDATA%\Typle\settings.json` にあります。画面で想定していなかったエラーは `%LOCALAPPDATA%\Typle\error.log` に書き、アプリは止めません。

## 構成

| 場所 | 内容 |
|---|---|
| `Typle.Core/` | Windows に依存しない .NET のライブラリ。`src/core` の入力判定・記録・ベスト・ランキング・単語リスト・端末・CSV・ダッシュボードと、Go のバックエンドとの通信（`AccountClient`・`AccountLogin`・`AccountSync`）。最初の単語リストは `src/plugins/packs` のファイルをそのまま埋め込みます（コピーはありません） |
| `Typle.Core.Tests/` | `Typle.Core` のテスト（xUnit）。Android 版の core と同じケースで、偽のバックエンドは `HttpMessageHandler` です |
| `Typle/` | WinUI 3 のアプリ。`Program.cs`（1つの窓を保ち、ログインの `typle-r://` を受け取る）、`App.cs`、`AppModel.cs`（状態）、`Shell.cs`（上部バーとサイドバー）、`Pages/`（各ページ）、`Storage/`（このパソコンとアカウント、設定、トークン）、`Support/`（部品・色・文言・グラフ）、`Messages/`（文言。Android 版の文言から作りました） |
| `ci/screenshots.ps1` | CI のスクリーンショット |

文字は JavaScript の `Array.from` と同じくコードポイントで数えるため、Web 版と同じ入力が同じミス数・正確率になります。

## 確認

```sh
dotnet test windows/Typle.Core.Tests
# 画面のコードの型チェック（Linux・macOS でも動きます）
dotnet build windows/Typle/Typle.csproj -p:Platform=x64 -r win-x64 -p:AppxGeneratePriEnabled=false -p:WindowsAppSDKSelfContained=false
```

- `.github/workflows/windows.yml` が、`windows/` を変えた PR と手動の実行で、core のテストと型チェック（Ubuntu）、アプリのビルドとスクリーンショット（Windows）を行います。マージ後の main への push では動きません（Actions の利用時間を節約するため）。Web 版のリリース・デプロイ（`ci.yml`）とは別です。
- `npm test` の `tests/windows.test.cjs` が、使っている文言が日本語・英語の両方にあり、プレースホルダーがそろっているか、「タブレット」「iPad」「Android」などが残っていないか、ログインが `client=windows` か（サーバーも受け付けるか）を確かめます。

## 範囲外

ガイド・Typleについて（Web 版を開きます）、日本語・英語以外の言語、Microsoft Store・MSIX での配布とコード署名、自動更新、ARM64 のビルド（プロジェクトは対応していますが、CI では作りません）、保存先の間のコピー、単語のドラッグでの並べ替え。
