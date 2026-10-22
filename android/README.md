# Typle for Android タブレット（Kotlin・Jetpack Compose）

Typle の Android タブレット版です。Web 版（`src/`）・iPad 版（`ios/`）と同じ判定・記録・ベストの規則で、タブレットを横向きにして外付けキーボードで練習できます。設計は `docs/superpowers/specs/2026-10-20-android-tablet-design.md` にあります。

## 必要なもの

- Android 8.0（API 26）以上のタブレット、またはエミュレーター
- ビルドするとき: JDK 17 以上と Android SDK（Android Studio を入れれば両方そろいます）

## 入れ方

GitHub Actions の `Android app` ワークフローが、`android/` を変えた PR と手動の実行（Actions の「Run workflow」）のたびに debug APK を作り、成果物 `typle-debug-apk` に残します。main の APK が欲しいときは、main で手動実行します。ダウンロードした `app-debug.apk` をタブレットに送り、「提供元不明のアプリ」を許可して開くと入ります。Play ストアには出していません。

自分でビルドするときは次のとおりです。

```sh
cd android
./gradlew :app:assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:installDebug         # USB でつないだタブレットに入れる
```

## 外付けキーボードで練習する

- タブレットを横にすると画面も横になります。幅が 1280dp 以上（Pixel Tablet などの横向き）なら左にサイドバー、それより狭ければ左上のメニューボタンです。
- 練習欄では予測・自動修正・自動大文字・貼り付けを使えません。変換中（日本語・中国語の入力など）の文字は判定せず、確定した文字だけを判定します。
- Esc でやり直し、結果画面では Enter でもう一度、単語リストの編集では Ctrl+Enter で保存します。
- 英字の単語リストは、キーボードの入力を英語（英数）にして打ってください。

## 見た目

Web 版と同じ画面構成・色・部品です。上部バー（ブランド・保存先・ライト／ダーク・アカウント）、幅に応じたサイドバーかドロワー、カード。色と角丸は `src/app/globals.css` の値を `app/src/main/kotlin/…/design/Theme.kt` に写しています。表示言語（日本語・English）は「一般」でその場で切り替えられます。

`.github/workflows/android.yml` は、サンプルデータ（Debug ビルドだけの起動引数 `typleDemo`、`app/src/debug/…/DemoEntry.kt`）で各ページをタブレットのエミュレーターに表示してスクリーンショットを撮り、ログと成果物 `android-screenshots` に残します（`ci/screenshots.sh`）。

## できること

| 画面 | 内容 |
|---|---|
| ホーム | 今週のまとめ（練習回数・連続練習・平均正確率・練習時間）、次に練習するリスト、リスト別の推移 |
| 練習 | リストの切り替え、端末の選択、ライブ指標、やり直し（ボタンと Esc）、表示と入力の色分け、次の単語・すべての単語、結果とベストとの比較、ベスト記録5件 |
| 単語リスト | 検索・並び替え、作成・編集のページ（単語の追加・削除・長押しドラッグや「…」での並べ替え、入力する文字が空欄なら表示と同じ）、CSV・TSV の取り込み、CSV の書き出し（共有）、複製、削除 |
| 練習記録 | 日ごとの一覧、リストと端末での絞り込み、削除 |
| ベスト記録 | リストごとの順位（正確率順・速さ順）、直近5回の平均、推移のグラフ |
| 端末 | 練習する端末の選択と使用回数、追加・変更・削除 |
| 一般 | 表示言語、保存先、GitHub のログイン・ログアウト |

## 保存先

| 保存先 | 内容 |
|---|---|
| このタブレット（既定） | アプリの内部ストレージの `workspace.json`。形は Web 版のブラウザー保存と同じです。読めないファイルは上書きしません |
| アカウント（GitHub） | Web 版の Typle（既定は本番の `https://typle-r-six.vercel.app`）に GitHub でログインし、Web 版と同じアカウントの単語リスト・記録・端末を、Go のバックエンドの `/api/workspace` で読み書きします（v0.57.0 から） |

- 2つのデータは別々で、切り替えてもコピーしません。
- アカウントでも、このタブレットと同じくすべての操作ができます（記録の削除と端末の変更も含みます）。変更のたびに、読み込んだときの `revision` を付けてデータ全体を保存します。別の画面で先に保存されていたとき（`409 conflict`）は、最新を読み直して同じ変更をやり直します（3回まで）。
- ログインは「一般」の「GitHub でログイン」で、Chrome Custom Tabs（`androidx.browser`）が GitHub のログインを開きます。終わると `typle-r://login?code=…` でアプリに戻り、コードをトークンに替えます。流れは [README の「iPad と Android と Windows のログイン」](../README.md#ipad-と-android-と-windows-のログイン) にあります。受け取ったトークンは Android Keystore の鍵で暗号化して保存し、有効期限は30日です。使っているあいだは自動で延びます。期限が切れたら、もう一度ログインしてください。
- ログアウトするとトークンを消して「このタブレット」に戻ります。ログインしたまま「このタブレット」に切り替え、あとで「アカウントに切り替える」で戻ることもできます。
- サーバーの URL は https だけです。http は `localhost`・`127.0.0.1`・`10.0.2.2`・`*.local` に限ります。エミュレーターから手元の Web 版（`npm run dev`）で試すときは `http://10.0.2.2:<ポート>` を入れます。GitHub の OAuth App の callback URL がサーバー（`AUTH_URL`）のものである必要があり、開発用ログインはアプリでは使えません。
- v0.56.x までの「アカウント（API）」（自分で立てる `/api/v1` に GitHub のトークンでつなぐ）はなくなりました。更新後の初回起動で、その設定とトークンを消して「このタブレット」に戻ります。

## 構成

| 場所 | 内容 |
|---|---|
| `core/` | Android に依存しない Kotlin/JVM のライブラリ（独立した Gradle ビルド）。`src/core` の入力判定・記録・ベスト・ランキング・単語リスト・端末・CSV・ダッシュボードと、最初の単語リスト（`src/plugins/packs` のコピー）。`gradle test` で確かめます |
| `app/` | Jetpack Compose のアプリ。`storage/`（このタブレットとアカウント、ログイン）、`practice/`、`lists/`、`records/`、`home/`、`devices/`、`settings/`、`design/`（色と部品）、`assets/messages/`（文言） |
| `gradle/libs.versions.toml` | 版の一覧（core も読みます） |

文字は JavaScript の `Array.from` と同じくコードポイントで数えるため、Web 版と同じ入力が同じミス数・正確率になります。

## 確認

```sh
cd android/core && ../gradlew test
```

- `.github/workflows/android.yml` が、`android/` を変えた PR と手動の実行で、core のテスト、debug APK のビルド、エミュレーターでの撮影を行います。マージ後の main への push では動きません（Actions の利用時間を節約するため）。Web 版のリリース・デプロイ（`ci.yml`）とは別です。
- `npm test` の `tests/android.test.cjs` が、最初の単語リストのコピーが元と同じか、使っている文言が日本語・英語の両方にあり、プレースホルダーがそろっているか、「iPad」「ブラウザー」が残っていないかを確かめます。`src/plugins/packs` を変えたら `core/src/main/resources` にコピーしてください。

## 範囲外

ガイド・Typleについて（Web 版を開きます）、日本語・英語以外の言語、Play ストアへの公開とリリース署名、スマートフォン向けのレイアウト、保存先の間のコピー。
