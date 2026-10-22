# Windows 11 版（WinUI 3）設計

日付: 2026-10-22

## 目的

Web 版をもとに、Windows 11 のネイティブアプリを WinUI 3 で作る。バックエンドは Web 版・iPad 版・Android 版と同じ
Go の関数（`/api/auth/*`・`/api/workspace`）を使い、同じ GitHub ログインで同じデータを読み書きする。

## 決めたこと

- C#（.NET 10）・WinUI 3（Windows App SDK 1.8）。パッケージにしない（unpackaged）・self-contained の exe を zip で配る。
  MSIX は署名の証明書が要るため使わない。
- 画面は XAML ファイルを使わず C# で組み立てる。XAML コンパイラーは Windows でしか動かないが、C# だけなら Linux でも
  `dotnet build -p:EnableWindowsTargeting=true`（RID `win-x64`、PRI 生成なし）で全体を型チェックできるため。App は
  `XamlControlsResources` を読み込み、`IXamlMetadataProvider` を WinUI の `XamlControlsXamlMetaDataProvider` に渡す
  （XAML コンパイラーが生成する部分の代わり）。
- 規則は Android 版の core（Kotlin）を C# に移した `windows/Typle.Core`（net10.0、OS 非依存）。テストも同じケースを
  xUnit に移す。最初の単語リストは `src/plugins/packs` を `EmbeddedResource` でそのまま埋め込む（コピーと照合テストは
  不要）。
- JSON は System.Text.Json。`RespectNullableAnnotations`・`RespectRequiredConstructorParameters` と `required` で、
  Kotlin と同じく必須の項目が無い・null なら読めないものとして扱う。知らない項目は無視、null の項目は書かない。
- 文言は Android 版の `assets/messages/{ja,en}.json` を変換して `windows/Typle/Messages` に置く（`%1$s` → `{0}`、
  `%%` → `%`、「タブレット」→「パソコン」、Android Keystore → DPAPI など）。複数形は同じ `{one, other, arg}`。
  エラーは `{name}` をそのまま埋める。

## ログイン

- サーバー（Go と Kotlin）の `/api/auth/signin` の `client` に `windows` を足す。流れは iPad・Android と同じで、
  `typle-r://login?code=…` に戻る。新しいエンドポイントは無い。
- ログイン画面は既定のブラウザー（`Process.Start` の ShellExecute）。WebView2 は使わない（GitHub が埋め込みの
  ログインを嫌い、パスワードがアプリを通るため。RFC 8252）。
- `typle-r` のプロトコルは `ActivationRegistrationManager.RegisterForProtocolActivation` で起動のたびに HKCU に登録。
  ブラウザーが開いた2つ目の Typle は `AppInstance.FindOrRegisterForKey` で動いている Typle を見つけ、
  `RedirectActivationToAsync` で URL を渡して終わる（Microsoft の単一インスタンスの手順。STA で
  `CoWaitForMultipleObjects` を使って待つ）。動いていなければ、その Typle が起動時の引数から URL を受け取る。
- ログイン途中の記録（verifier・サーバー URL・開始時刻）は `settings.json` に置き、10 分で無効（Android と同じ）。
  ブラウザーを閉じたことは分からないので、「一般」に「ログインをやめる」を置く。
- トークンは DPAPI（`ProtectedData`、CurrentUser、エントロピー付き）で暗号化して `token.dat`。復号できなければ
  ログアウトした扱い。
- 保存は iPad・Android と同じ方式：文書全体を revision 付きで PUT、409 なら読み直して同じ変更をやり直す（全部で 3 回）。
  `AccountSync` は `SemaphoreSlim` で 1 つずつ。

## 画面

- `AppModel` が状態（ページ・保存先・文書・選んだ端末・言語・テーマ）を持ち、変わるたびに `Changed` を出す。
  `Shell` が上部バー・サイドバー（`SplitView`、幅 1100 px 未満でオーバーレイ）・ページを表示し、テーマか言語が
  変わったときは全部を作り直す。
- 各ページ（`PageView`）は `Refresh()` で中身を作り直すが、文字を打つ欄（練習欄・検索・単語の編集・サーバー URL）は
  作り直さずに保ち、入力とフォーカスが途切れないようにする。練習の進行は `AppModel.Practice` に置き、作り直しでも
  失われない。
- 練習欄は `TextBox`。`TextCompositionStarted/Ended` で変換中を判定から外し、Esc でやり直し、貼り付けは無効。
  表示する文字は `Run` の色と下線で塗り分ける。
- CSV・TSV の取り込みは `FileOpenPicker`、書き出しは `FileSavePicker`（どちらも窓のハンドルで初期化）。
- 単語の並べ替えはドラッグの代わりに「…」のメニューと Alt+↑↓。

## テスト・CI

- `windows/Typle.Core.Tests`：Android 版の core のテストと同じケース（入力判定・記録・日付・端末・リスト・CSV・
  ワークスペース・ダッシュボード・アカウントの通信と同期）。偽のバックエンドは `HttpMessageHandler`。
- `tests/windows.test.cjs`（`npm test`）：使っている文言キーが ja・en にある、プレースホルダーがそろう、
  「タブレット」などが無い、ログインが `client=windows` でサーバーも受け付ける。
- `.github/workflows/windows.yml`：PR（`windows/` などを変えたとき）と手動。Ubuntu で core のテストと型チェック、
  Windows で `dotnet publish` とスクリーンショット（`--demo` のサンプルデータで各ページ、入力中・結果・ダーク・英語）。
  アプリは成果物 `typle-windows-x64`。リリース・デプロイ（`ci.yml`）とは別で、main への push では動かさない。
- Go：`client=windows` のログインと、challenge が無い・形が違うときの `loginFailed`（`app_test.go`）。Kotlin も同じ。

## バージョン・ドキュメント

- `package.json` を 0.59.0。`README.md` に v0.59.0 の節と「iPad と Android と Windows のログイン」。
  `windows/README.md`。`docs/api.md` に Windows も `/api/v1` を使わないことを書く。`.vercelignore` に `windows`。
