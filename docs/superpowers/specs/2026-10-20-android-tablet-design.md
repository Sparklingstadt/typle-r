# Android タブレット版（Kotlin・Jetpack Compose） 設計

- 日付: 2026-10-20
- 対象バージョン: v0.46.0
- 前提: Web 版（Next.js）の `src/core`、v0.44.0 の Go API（`docs/api.md`）、iPad 版（`ios/`、`2026-10-20-ipad-app-design.md`・`2026-10-20-ipad-web-look-design.md`）

## 目的

Android タブレットを横向きにして外付けキーボードをつなぎ、Web 版と同じ判定・記録で練習できるようにする。機能は iPad 版と同じ全ページ、見た目は Web 版と同じにする。

## 決定事項

| 項目 | 決定 |
|---|---|
| 場所 | `android/`。Web 版（`src/`）、Go API（`server/`）、iPad 版（`ios/`）は変更しない |
| 方式 | Kotlin のネイティブアプリ。画面は Jetpack Compose（Material 3 の部品は使わず、Web 版の shadcn の部品を Compose で作る）。Kotlin Multiplatform や WebView は使わない |
| 対象 | Android 8.0（API 26）以上のタブレット。縦・横の4方向に回る。スマートフォンでも起動はするが、レイアウトはタブレット向け |
| ビルド | Gradle（Kotlin DSL、Gradle Wrapper をコミット）。バージョンは `android/gradle/libs.versions.toml` にまとめる |
| 構成 | `android/core`（Android に依存しない Kotlin/JVM ライブラリ。モデルと規則）と `android/app`（Compose のアプリ）。依存は app → core の一方向 |
| 判定・記録 | `src/core` の `typing.ts`・`records.ts`・`wordLists.ts`・`devices.ts`・`rankings.ts`・`listOverview.ts`・`dashboard.ts`・`wordFiles.ts` と同じ規則を Kotlin に移す。文字は JavaScript の `Array.from` と同じくコードポイントで数える。JSON は kotlinx.serialization |
| core のテスト | iPad 版の TypleCore の XCTest と同じ内容を JUnit に移す（`./gradlew :core:test`。この環境でも Maven Central から取得して動く） |
| 保存先 | 「このタブレット」（既定）と「アカウント（API）」の2つ。データは分離し、自動でコピーしない |
| このタブレット | アプリの内部ストレージの `workspace.json`。形は Web 版のブラウザー保存（`{ version: 1, accountId, revision, lists, devices }`）と同じで、`accountId` は `android:local`。読めないファイルは上書きせずエラーを出す |
| アカウント（API） | Go API を `-writable` で起動し、HTTPS で公開したサーバーの URL と GitHub のトークンを「一般」で入れる。トークンは Android Keystore の鍵で暗号化して保存する。同じネットワークの `http://<名前>.local` だけは HTTP を許す |
| API でできること | 読み込み、リストの作成・変更・削除・複製、記録の追加（`id` を付けて送るので、やり直しても増えない）、端末の追加・変更・削除（v0.44.0 の API）。記録の変更・削除（v0.45.0 の API）はこの版では扱わない |
| 最初のリスト | `src/plugins/packs` のサンプルと国名193か国を `core` のリソースにコピーし、Node のテスト（`tests/android.test.cjs`）でコピーが元と同じか確かめる |
| 外枠 | Web 版の `layout.tsx` と同じく 56dp の上部バー（ブランド・保存先バッジ・ライト／ダーク・アカウント）と、幅 1280dp 以上で 240dp のサイドバー、それ未満でメニューボタンから開く 288dp のドロワー。項目と並びは `navigation.ts` と同じ。ヘルプの3項目は Web 版をブラウザーで開く |
| 色・部品 | `globals.css` の neutral の値（iPad 版の `Palette` と同じ sRGB）を `Theme.kt` に。Card・Button（primary／outline／ghost／secondary／destructive）・Badge・Kbd・FilterMenu・ToggleGroup・検索欄を Compose で作る。字は端末の標準フォント |
| ページ | ホーム（ダッシュボード）、練習、練習記録、ベスト記録（一覧と詳細）、単語リスト、作成・編集（ページ）、一般、端末。それぞれ Web 版の同じページの並びと文言 |
| 入力欄 | `EditText`（`AndroidView`）を包み、`inputType` を予測・自動修正・自動大文字なし（`TYPE_TEXT_FLAG_NO_SUGGESTIONS`。中国語・日本語の単語も打てるよう `VISIBLE_PASSWORD` は使わない）に、貼り付けとドロップを無効にする。変換中（composing span があるとき）の文字は判定せず、確定した文字だけを判定する。外付けキーボードの Esc（`KEYCODE_ESCAPE`）でやり直す |
| 単語の編集 | Web 版・iPad 版と同じく、入力する文字が表示と同じなら空欄で表示し、空欄は表示と同じとして保存する。並べ替えはドラッグと「…」メニュー。CSV・TSV の取り込みはシステムのファイル選択、CSV の書き出しは共有シート |
| 言語 | 日本語と英語。文言は iPad 版の文言（Web 版の `src/messages/{ja,en}` から作ったもの）を `android/app/src/main/assets/messages/{ja,en}.json` に置く（キーは iPad 版・Web 版と同じドット区切り。Android のリソース名にはドットが使えないため `strings.xml` は使わない）。「一般」でその場で切り替え、iPad 版と同じく画面を作り直す。既定は端末の言語。「このブラウザー」「この iPad」は「このタブレット」に言い換える |
| テーマ | 上部バーのボタンで、いま表示している明るさの反対に固定する（Web 版と同じ）。既定はシステム |
| 文言の確認 | `tests/android.test.cjs` が、コードで使っている文言キーが日本語・英語の両方にあり、プレースホルダーがそろっていて、「iPad」「ブラウザー」が残っていないかを確かめる |
| CI | `.github/workflows/android.yml`（ubuntu）。`android/` を変えた PR と main への push で、`:core:test`、`:app:assembleDebug`、タブレットのエミュレーター（横 1280×800dp）で各ページをサンプルデータ（Debug ビルドだけの起動引数）で撮影してログに出す。debug APK を成果物に残す。リリース・デプロイ（`ci.yml`）には関わらない |
| 配布 | CI の成果物の debug APK を手で入れる。Play ストアへの公開と署名鍵の管理は範囲外 |
| その他 | `.vercelignore` に `android` を追加。README と `android/README.md`。v0.46.0 |

## データの流れ

`WorkspaceStore`（インターフェース）を「このタブレット」（`LocalWorkspaceStore`）と API（`ApiWorkspaceStore`）が実装する。`AppModel`（`ViewModel`、Compose の `State`）が読み込んだ `WorkspaceDocument` を持ち、各ページはそこから表示し、変更は `AppModel` を通してストアに書く。保存に失敗したら画面にエラーを出し、記録の保存は結果画面で再試行できる。

## 範囲外

- ガイド・Typleについてのページ（Web 版を開く）
- Play ストアへの公開、リリース署名
- オフラインで追加した記録を後で API に送る仕組み
- 保存先の間のコピー、クラウド同期
- 日本語・英語以外の言語
- スマートフォン向けのレイアウト
- Web 版のキーボードショートカットのうち、単語の Alt+↑↓ 移動
