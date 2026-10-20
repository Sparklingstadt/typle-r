# Android タブレット版 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPad 版（`ios/`）と同じ全ページ・Web 版と同じ見た目の Android タブレットアプリを `android/` に作る。

**Architecture:** iPad 版の Swift をそのまま Kotlin に移す。`android/core` は Android に依存しない Kotlin/JVM の独立した Gradle ビルド（TypleCore の移植）で、`android/` のルートビルドが `includeBuild("core")` で取り込み、`android/app`（Jetpack Compose）が依存する。画面・状態・保存は `ios/Typle` の同じ名前のファイルを Kotlin・Compose に移す。

**Tech Stack:** Kotlin 2.1.21、Gradle 8.14.3（Wrapper）、Android Gradle Plugin 8.9.1、Compose BOM 2025.05.00、kotlinx-serialization-json 1.8.1、JUnit 4.13.2、compileSdk/targetSdk 35、minSdk 26、JDK 17 ターゲット。

**Spec:** `docs/superpowers/specs/2026-10-20-android-tablet-design.md`

## Global Constraints

- 置き場所は `android/` だけ。`src/`・`server/`・`ios/` は変えない（例外: `.vercelignore`・`README.md`・`package.json`・`package-lock.json`・`tests/android.test.cjs`）。
- 版は v0.46.0（`npm version 0.46.0 --no-git-tag-version`、`android/app` の `versionName = "0.46.0"`、`versionCode = 1`）。
- applicationId は `io.github.sparklingstadt.typle`。
- 文字はコードポイントで数える（Kotlin では `String.codePoints()`。`length` や `Char` 単位で数えない）。
- 「このタブレット」の `accountId` は `android:local`。ファイルは `filesDir/workspace.json`。読めないファイルは上書きしない。
- 文言は画面に直接書かず、すべて `L("key", ...)` を通す。日本語と英語の両方に同じキーと同じプレースホルダーを置く。
- 「このブラウザー」「この iPad」は「このタブレット」（英語は "this tablet"）に言い換える。
- 練習欄は `TYPE_TEXT_FLAG_NO_SUGGESTIONS` を使い、`VISIBLE_PASSWORD` は使わない。
- 幅 1280dp 以上でサイドバー（240dp）、未満でドロワー（288dp）。上部バーは 56dp。
- この環境では `dl.google.com` に届かないため、`android/app` のビルドは GitHub Actions（`android.yml`）でしか確かめられない。`android/core` は `cd android/core && gradle test` でここでも確かめる。

**仕様からの変更（1点）:** 文言は `strings.xml` ではなく `android/app/src/main/assets/messages/{ja,en}.json`（キーは iPad 版と同じドット区切り）に置き、言語の切り替えは iPad 版と同じくアプリ内の状態で行う（`AppCompatDelegate` は使わない）。Android のリソース名にはドットが使えず、キーを iPad 版・Web 版とそろえられないため。設計書の該当行もこの計画のタスク 3 で直す。

## Review Focus

1. **サロゲートペアや結合文字を含む単語**（😀、e+U+0301）: Web 版と同じミス数・正確率になること → タスク 2 の `TypingTest.emptyListsAndUnicode`。
2. **日本語・中国語 IME で変換中の文字**: 確定するまでミスにならないこと → タスク 5 の `CompositionFilterTest`（`core` に置く純粋関数で確かめる）。
3. **壊れた・新しい版の `workspace.json`**: 上書きせずにエラーを出すこと → タスク 1 の `WorkspaceTest.unreadableFileIsAnError`、タスク 4 の `LocalWorkspaceStore` はそのエラーで保存を止める。
4. **画面を回したとき**（練習の途中で横 ↔ 縦）: 練習の進み具合と入力が消えないこと → タスク 5 で `PracticeModel` を `ViewModel` に置き、CI の撮影で縦横の両方を撮る。
5. **API の保存に失敗した記録**: 結果画面に残って再試行でき、同じ `id` で送るので二重にならないこと → タスク 5 の結果画面、`ApiWorkspaceStore.addRecord` は記録の `id` をそのまま送る。

---

### Task 1: core の骨組み・モデル・保存形式

**Files:**
- Create: `android/core/settings.gradle.kts`, `android/core/build.gradle.kts`（`kotlin("jvm")`・`kotlin("plugin.serialization")` 2.1.21、group `io.github.sparklingstadt.typle`、`jvmToolchain(17)`）
- Create: `android/core/src/main/kotlin/io/github/sparklingstadt/typle/core/{Models,Dates,Workspace}.kt`
- Create: `android/core/src/main/resources/{samples,countries}.json`（`ios/TypleCore/Sources/TypleCore/Resources` と同じ内容）
- Test: `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/WorkspaceTest.kt`

**Interfaces:**
- Produces: `ios/TypleCore/Sources/TypleCore/{Models,Dates,Workspace}.swift` の公開 API と同じ名前。対応の規則（以降のタスクも同じ）:
  - Swift の `struct` → `@Serializable data class`、`enum` → `enum class`、`throws TypleError` → `throw TypleException(key: String, values: Map<String, String> = emptyMap())`（`RuntimeException`）。
  - `Date` → `java.time.Instant`、`Calendar` → `java.time.ZoneId`、`Data` → `ByteArray`、`Locale` → `java.util.Locale`。
  - `parseDate(value: String): Instant?`、`isoString(instant: Instant): String`（ミリ秒つき UTC、`2026-10-20T09:41:00.000Z`）。
  - `initialLists(): List<WordList>`、`decodeWorkspaceFile(data: ByteArray, accountId: String): WorkspaceFile`、`encodeWorkspaceFile(file: WorkspaceFile): ByteArray`、`randomId(): String`。
  - JSON は `Json { ignoreUnknownKeys = false; explicitNulls = false; encodeDefaults = true }` を `TypleJson` として公開し、app も使う。

- [ ] **Step 1: テストを書く** — `ios/TypleCore/Tests/TypleCoreTests/TypleCoreTests.swift` のうち Workspace・Dates・初期リストのテストを JUnit に移す。加えて:

```kotlin
@Test fun unreadableFileIsAnError() {
  val e = assertThrows(TypleException::class.java) { decodeWorkspaceFile("{\"version\":2}".toByteArray(), "android:local") }
  assertEquals("savedDataUnreadable", e.key)
}
@Test fun initialListsMatchThePacks() {
  val lists = initialLists()
  assertEquals(listOf("Test 1", "Test 2", "国名：中国語・国連加盟193か国"), lists.map { it.name })
  assertEquals(193, lists[2].words.size)
}
```

（エラーのキーは Swift 側と同じ。）

- [ ] **Step 2: 失敗を確かめる** — Run: `cd android/core && gradle test` / Expected: コンパイルエラー（未定義）。
- [ ] **Step 3: `Models.kt`・`Dates.kt`・`Workspace.kt` を Swift から移す。**
- [ ] **Step 4: 通ることを確かめる** — Run: `cd android/core && gradle test` / Expected: `BUILD SUCCESSFUL`。
- [ ] **Step 5: Commit** — `feat(android): core のモデルと保存形式を移す`

### Task 2: core の規則（判定・記録・ベスト・リスト・端末・CSV・ダッシュボード）

**Files:**
- Create: `android/core/src/main/kotlin/io/github/sparklingstadt/typle/core/{Typing,Records,Rankings,WordLists,Devices,WordFiles,Dashboard}.kt`
- Test: `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/{TypingTest,RecordsTest,RankingsTest,WordListsTest,DevicesTest,WordFilesTest,DashboardTest}.kt`

**Interfaces:**
- Consumes: タスク 1 の型。
- Produces: `ios/TypleCore/Sources/TypleCore/` の同名ファイルの公開関数と型を同じ名前・同じ引数順で（例: `typeInput(session: TypingSession, words: List<Word>, value: String, now: Double): TypingSession`、`compareInput(target: String, typed: String): InputComparison`、`listRanking(list, device: String? = null, order: RankOrder = RankOrder.ACCURACY, includeOthers: Boolean = false, now: Instant = Instant.now())`、`summarize(lists, now: Instant, zone: ZoneId)`）。タプルを返す Swift 関数は `Pair` か名前つきの `data class`（`duplicateList` → `DuplicateResult(lists, copy)`、`durationParts`・`recordTimeParts` → `List<TimePart(value: String, unit: TimeUnit)>`）。
- 並び替えの `locale` は `java.text.Collator.getInstance(locale)` で比べる。

- [ ] **Step 1: テストを書く** — `TypleCoreTests.swift` の残り（Typing・Records・Rankings・WordLists・Devices・WordFiles）と `DashboardTests.swift`（9件、`ZoneId.of("Asia/Tokyo")`）を、同じ値のまま JUnit に移す。
- [ ] **Step 2: 失敗を確かめる** — Run: `cd android/core && gradle test` / Expected: コンパイルエラー。
- [ ] **Step 3: 7ファイルを Swift から移す。**
- [ ] **Step 4: 通ることを確かめる** — Run: `cd android/core && gradle test` / Expected: Swift と同じ件数（27件）以上が PASS。
- [ ] **Step 5: Commit** — `feat(android): core の判定・記録・ランキングの規則を移す`

### Task 3: 文言と Node のテスト

**Files:**
- Create: `android/app/src/main/assets/messages/ja.json`, `android/app/src/main/assets/messages/en.json`
- Create: `tests/android.test.cjs`
- Modify: `docs/superpowers/specs/2026-10-20-android-tablet-design.md`（言語の行を JSON とアプリ内の切り替えに）

**Interfaces:**
- Produces: JSON は `{ "key": "text" }`、複数形は `{ "key": { "one": "...", "other": "..." } }`。プレースホルダーは Java の書式（`%1$s`、`%d`、`%%`）。中身は `ios/Typle/Resources/{ja,en}.lproj`（`%@` → `%s`、`%ld` → `%d`、stringsdict → 複数形）から作り、「この iPad」を「このタブレット」に、"this iPad" を "this tablet" に置き換える。

- [ ] **Step 1: テストを書く** — `tests/android.test.cjs` は `tests/ios.test.cjs` と同じ3つを確かめる: (a) `android/core/src/main/resources/{samples,countries}.json` が `src/plugins/packs` から作ったものと同じ（ios のテストと同じ比べ方）、(b) `android/` の `.kt` で使う `L("…")`・`P("…")` のキーが ja・en の両方にある（動的なキーは ios のテストと同じ前置きの表）、(c) 各キーのプレースホルダーの位置と型が ja・en で同じ。加えて、どちらの JSON にも「iPad」「ブラウザー」「browser」が残っていないこと。
- [ ] **Step 2: 失敗を確かめる** — Run: `node --test tests/android.test.cjs` / Expected: FAIL（ファイルがない）。
- [ ] **Step 3: JSON を作る**（変換スクリプトは scratchpad に置き、コミットしない）。設計書の言語の行を直す。
- [ ] **Step 4: 通ることを確かめる** — Run: `node --test tests/android.test.cjs` / Expected: PASS（(b) はまだ `.kt` がないので空で通る）。
- [ ] **Step 5: Commit** — `feat(android): 日本語・英語の文言とその確認を加える`

### Task 4: アプリの骨組み・テーマ・部品・保存・外枠・CI のビルド

**Files:**
- Create: `android/settings.gradle.kts`（`includeBuild("core")`、`include(":app")`、リポジトリは `google()`・`mavenCentral()`）、`android/build.gradle.kts`、`android/gradle/libs.versions.toml`、`android/gradle.properties`、Gradle Wrapper（`gradle wrapper --gradle-version 8.14.3` で作る）、`android/.gitignore`
- Create: `android/app/build.gradle.kts`（compose・serialization、`implementation("io.github.sparklingstadt.typle:core")`、`buildConfig = true`）、`android/app/src/main/AndroidManifest.xml`（INTERNET、`configChanges` は付けない、`android:networkSecurityConfig` で `.local` だけ平文を許す）、`res/xml/network_security_config.xml`、ランチャーアイコン（`ios/Typle/Resources/Assets.xcassets` の AppIcon から）
- Create: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/`:
  - `MainActivity.kt`、`TypleApp.kt`（`RootView`・`TopBar`・`Brand`・`AccountButton`・`NavList`・`Drawer`）
  - `AppModel.kt`（`Route`・`Appearance`・`AppLanguage`、`ios/Typle/AppModel.swift` と同じ状態と操作）
  - `design/Theme.kt`（`Palette`・`Radius` と `ios/Typle/Design/Theme.swift` の全部品を Composable で）
  - `support/Localization.kt`（`L`・`P`・`fill`・`errorText`・`Format`）
  - `storage/{WorkspaceStore,ApiWorkspaceStore,TokenVault}.kt`
- Create: `.github/workflows/android.yml`（このタスクではビルドまで）

**Interfaces:**
- Consumes: タスク 1・2 の core、タスク 3 の JSON。
- Produces:
  - `fun L(key: String, vararg args: Any): String`、`fun P(key: String, count: Int, vararg args: Any): String`（複数形。`count` を最初の引数にも使う）、`object Localization { fun use(language: AppLanguage, assets: AssetManager) }`。
  - `interface WorkspaceStore { val kind: StoreKind; suspend fun load(): WorkspaceDocument; suspend fun saveList(list: WordList, editing: Boolean): WorkspaceDocument; suspend fun deleteList(id: String): WorkspaceDocument; suspend fun duplicateList(id: String, suffix: (Int) -> String): Pair<WorkspaceDocument, WordList>; suspend fun addRecord(listId: String, record: StoredRecord): WorkspaceDocument; suspend fun removeRecord(listId: String, record: StoredRecord): WorkspaceDocument; suspend fun saveDevice(device: PracticeDevice, editing: Boolean): WorkspaceDocument; suspend fun deleteDevice(id: String): WorkspaceDocument }`（`ios/Typle/Storage/WorkspaceStore.swift` に合わせ、端末の編集を API でも行う。`removeRecord` は API では `TypleException("apiUnsupported")`）。
  - `class AppModel(application: Application) : AndroidViewModel` — 公開する状態は Compose の `mutableStateOf`。`route`、`document`、`language`、`appearance`、`rankingsList`、`practice(listId)`、`showRankings(listId)`、`setLiveStatsVisible(...)` は Swift と同じ名前。
  - `TokenVault`: Android Keystore の AES/GCM 鍵（別名 `typle-token`）で暗号化し、`SharedPreferences` に保存。`fun read(): String?`、`fun write(token: String?)`。
  - 外枠は `BoxWithConstraints` の `maxWidth >= 1280.dp` でサイドバー、未満でドロワー（左から 288dp、背景を暗くし、外側を押すと閉じる）。
- `android.yml`: `ubuntu-latest`、`actions/setup-java`（temurin 17）、`gradle/actions/setup-gradle`、`cd android/core && ../gradlew -p . test`、`cd android && ./gradlew :app:assembleDebug`。トリガーは `android/**`・`src/plugins/packs/**`・`.github/workflows/android.yml` を変えた PR と main への push、`workflow_dispatch`。ほかの workflow と同じくアクションはコミット SHA で固定する。

- [ ] **Step 1: ローカルで確かめられる部分を確かめる** — Run: `cd android/core && gradle test && cd ../.. && node --test tests/android.test.cjs` / Expected: PASS（`L("…")` のキーがすべて JSON にある）。
- [ ] **Step 2: Commit・push し、`android.yml` の `assembleDebug` が通ることを確かめる** — Expected: `BUILD SUCCESSFUL`。落ちたらログのエラーを直して push し直す。
- [ ] **Step 3: Commit** — `feat(android): アプリの外枠・テーマ・保存先と CI のビルドを加える`

### Task 5: 練習と結果

**Files:**
- Create: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/practice/{PracticeModel,PracticeView,PracticeParts,PracticeResultView,PracticeTextField}.kt`
- Create: `android/core/src/main/kotlin/io/github/sparklingstadt/typle/core/Composition.kt`
- Test: `android/core/src/test/kotlin/io/github/sparklingstadt/typle/core/CompositionFilterTest.kt`

**Interfaces:**
- Consumes: `AppModel`、`WorkspaceStore.addRecord`、core の `typeInput`・`compareInput`・`sessionResult`・`typingSpeed`・`makeRecord`・`bestRecords`。
- Produces: `fun committedText(text: String, composingStart: Int, composingEnd: Int): String?` — 変換中の範囲（`-1` ならなし）があれば `null`（判定しない）、なければ `text` を返す。`PracticeTextField` は `EditText` の `TextWatcher` でこれを呼び、`null` 以外のときだけ `PracticeModel.type(value)` に渡す。`KEYCODE_ESCAPE` で `onEscape`。貼り付けは `customSelectionActionModeCallback`／`customInsertionActionModeCallback` でメニューを出さず、`OnReceiveContentListener` で受け取らない。
- `PracticeModel` は `ViewModel` に置き、画面を回しても進み具合と入力が残る。

- [ ] **Step 1: テストを書く**

```kotlin
@Test fun composingTextIsNotJudged() {
  assertNull(committedText("ほげ", 0, 2))
  assertEquals("hoge", committedText("hoge", -1, -1))
  assertNull(committedText("中国", 1, 2))
}
```

- [ ] **Step 2: 失敗を確かめる** — Run: `cd android/core && gradle test --tests '*CompositionFilterTest*'` / Expected: コンパイルエラー。
- [ ] **Step 3: `Composition.kt` と練習の5ファイルを `ios/Typle/Practice/` から移す**（並び・文言・色分け・ライブ指標・次の単語・すべての単語・端末の選択・リストの切り替え・ベスト記録5件・結果とベストとの比較・保存の再試行）。
- [ ] **Step 4: 確かめる** — Run: `cd android/core && gradle test` と `node --test tests/android.test.cjs` / Expected: PASS。push して `assembleDebug` が通る。
- [ ] **Step 5: Commit** — `feat(android): 練習と結果の画面を加える`

### Task 6: 単語リストと作成・編集

**Files:**
- Create: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/lists/{ListsView,ListEditorView}.kt`

**Interfaces:**
- Consumes: `WorkspaceStore.saveList`・`deleteList`・`duplicateList`、core の `listOverviews`・`sortOverviews`・`matchesQuery`・`parseWordData`・`encodeWordCsv`・`saveList`（検証）。
- Produces: `Route.CreateList`・`Route.EditList(id)` の画面。CSV・TSV の取り込みは `rememberLauncherForActivityResult(OpenDocument())`（`text/*`）、書き出しは `cacheDir` に `<名前>.csv` を書いて `FileProvider`（`${applicationId}.files`）で共有する。並べ替えは長押しドラッグ（`detectDragGesturesAfterLongPress`）と「…」メニュー（上へ・下へ・先頭へ・末尾へ）。

- [ ] **Step 1: `ios/Typle/Lists/` から移す**（入力する文字が表示と同じなら空欄で表示し、空欄は表示と同じとして保存）。
- [ ] **Step 2: 確かめる** — Run: `node --test tests/android.test.cjs` / Expected: PASS。push して `assembleDebug` が通る。
- [ ] **Step 3: Commit** — `feat(android): 単語リストと作成・編集の画面を加える`

### Task 7: ホーム・練習記録・ベスト記録・端末・一般

**Files:**
- Create: `android/app/src/main/kotlin/io/github/sparklingstadt/typle/{home/HomeView,records/RecordsView,records/RankingsView,devices/DevicesView,settings/GeneralSettingsView}.kt`

**Interfaces:**
- Consumes: core の `summarize`・`nextLists`・`listTrends`・`recordRows`・`filterRows`・`groupByDay`・`listRanking`・`sortRankings`・`rankingStats`・`deviceUsage`・`deviceProblem`、`WorkspaceStore.removeRecord`・`saveDevice`・`deleteDevice`、`TokenVault`。
- Produces: 残りの `Route` の画面。グラフ（ホームの推移・ベスト記録の詳細）は Compose の `Canvas` で描く（グラフのライブラリは入れない）。「一般」の言語の切り替えは `AppModel.language` を変え、`RootView` を `key(language)` で作り直す。

- [ ] **Step 1: `ios/Typle/{Home,Records,Devices,Settings}/` から移す**（API のときも端末の追加・変更・削除ができる。記録の削除は「このタブレット」のときだけ）。
- [ ] **Step 2: 確かめる** — Run: `node --test tests/android.test.cjs` / Expected: PASS。push して `assembleDebug` が通る。
- [ ] **Step 3: Commit** — `feat(android): ホーム・記録・ベスト記録・端末・一般の画面を加える`

### Task 8: サンプルデータ・撮影・APK・文書・版

**Files:**
- Create: `android/app/src/debug/kotlin/io/github/sparklingstadt/typle/DemoData.kt`（`ios/Typle/Support/DemoData.swift` と同じ記録と端末）
- Modify: `.github/workflows/android.yml`（撮影と APK）、`.vercelignore`（`android`）、`README.md`（v0.46.0 の節）、`package.json`・`package-lock.json`（0.46.0）
- Create: `android/README.md`（`ios/README.md` と同じ構成）

**Interfaces:**
- Debug ビルドだけ、起動 Intent の extras `typleDemo`（boolean）・`typleRoute`（`home|practice|records|rankings|lists|createList|editList|general|devices`）・`typleLanguage`（`ja|en`）・`typleTyping`（文字列）・`typleRankingsList`（ID）で、サンプルデータの一時ストアとページを選ぶ（`BuildConfig.DEBUG` で分ける）。
- `android.yml` の撮影: `reactivecircus/android-emulator-runner`（KVM を有効にし、`api-level: 34`、`target: google_apis`、`arch: x86_64`、`profile: pixel_tablet`）で APK を入れ、`adb shell settings put system accelerometer_rotation 0` と `user_rotation 1`（横）にしてから、各ページ・入力中・結果・ベスト記録の詳細・ダーク（`adb shell cmd uimode night yes`）・English・縦（`user_rotation 0`）を `adb exec-out screencap -p` で撮る。iPad 版と同じく `SCREENSHOT <名前> <base64 JPEG>` をログに出し、`android-screenshots` と `typle-debug-apk`（`app-debug.apk`）を成果物に残す。

- [ ] **Step 1: 実装し、ローカルの確認を通す** — Run: `cd android/core && gradle test`、`node --test tests/android.test.cjs`、`npm run lint` / Expected: PASS。
- [ ] **Step 2: Commit・push し、PR を draft で作る。** `android.yml` と `ci.yml` が通ることを確かめる。
- [ ] **Step 3: ログのスクリーンショットを取り出して Web 版（横 1280×800）と見比べる。** 違いを直して push し、もう一度撮る。
- [ ] **Step 4: Commit** — `chore(android): ページを CI で撮影し、v0.46.0 にする`
