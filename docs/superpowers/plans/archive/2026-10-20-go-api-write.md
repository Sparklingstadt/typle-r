# API（Go）の書き込み Implementation Plan

> この計画は実装済みの記録です。書かれている構成・パス・手順は当時のもので、今の構成は [README](../../../../README.md) を見てください。ここから作業を始めないでください。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `server/` の Go API に、`-writable` で有効になるリストの作成・変更・削除と記録の追加を加える。

**Architecture:** 検証と変更は `internal/workspace` の純粋関数（`*workspace.Error{Key}` を返す）。`internal/store.Modify` がトランザクション内で `SELECT … FOR UPDATE` → 変更 → `Encode` → 大きさの判定 → `UPDATE … revision + 1` を行う。`internal/api` は本文を読み、`Modify` に変更の関数を渡し、エラーのキーをステータスに変える。

**Tech Stack:** Go 1.25（標準ライブラリ）、pgx v5.9.2、PostgreSQL 16（テスト用）

**Spec:** `docs/superpowers/specs/2026-10-20-go-api-write-design.md`

## Global Constraints

- 依存は標準ライブラリと pgx だけ。UUID v4 は `crypto/rand` で作る。
- 上限（長さは UTF-16 のコード単位。既存の `length` を使う）: リスト100件、名前200、単語1000件、`display`・`input` 1000、`annotation` 2000、記録10000件/リスト、記録の `id` 1〜100文字の `[A-Za-z0-9_-]`、本文 1MiB（`1 << 20`）、`lists` 列 896KiB（`896 << 10`）。
- 日時の保存形は UTC の `2006-01-02T15:04:05.000Z`（`toISOString`）。`createdAt` も同じ形。
- `default` 端末のコピーは `{ "id": "default", "name": "デフォルト", "layout": "" }`。
- 名前の重複判定は `strings.ToLower(strings.TrimSpace(name))` で比べる。保存する名前は `strings.TrimSpace` 済み。単語の空白はそのまま。
- エラー本文は `{ "error": "<キー>" }`。判定の順序は 404（未知のパス）→ 405 → 認証 → 本文 → DB を読む → `listNotFound` → 検証 → DB に書く。
- `-writable` でないときは今と同じ動き（`GET, HEAD` だけ、DB接続は `default_transaction_read_only=on`）。
- コメントとコミットメッセージは既存の書き方（英語のコメント、日本語のコミット件名）に合わせる。各コードタスクの最後に `gofmt -l .`（空）・`go vet ./...`・`go test ./...` を通す。

## Review Focus

- 本文が `null` だけ、または空の `POST` → どこにも書かずに `400 invalidJson`（Task 5 でテスト）。
- `mistakes: 1.5`、`wordCount: 0` のような数値の誤り → JSON の型エラーではなく `400 invalidRecord`（Task 3 でテスト。入力は `float64` で受けて整数か確かめる）。
- 時差付きの日時 `2026-10-10T11:00:00+09:00` → `2026-10-10T02:00:00.000Z` で保存し、その形で返す（Task 3 でテスト）。
- `PATCH` の `"words": []` → 省略扱いにせず `400 wordsRequired`（Task 2 でテスト。`nil` と空スライスを区別する）。
- 同じ `id` の記録を値を変えて再送 → 保存済みの記録をそのまま `200` で返し、何も書かない（Task 3・Task 4 でテスト）。

---

## Setup（実装の前に1回）

テスト用の DB を用意する（Docker がなければ PostgreSQL 16 のバイナリで）。

```bash
export PGDATA=/tmp/claude-pg && /usr/lib/postgresql/16/bin/initdb -U typle --auth=trust "$PGDATA" >/dev/null
/usr/lib/postgresql/16/bin/pg_ctl -D "$PGDATA" -o "-p 5433 -k /tmp" -l /tmp/claude-pg.log start
createdb -h 127.0.0.1 -p 5433 -U typle typle
cd /home/user/typle-r && DATABASE_URL=postgresql://typle@127.0.0.1:5433/typle npm run db:migrate
export TYPLE_TEST_DATABASE_URL=postgresql://typle@127.0.0.1:5433/typle
cd server && go test ./...
```

Expected: 既存のテストがすべて PASS（DB のテストも skip されない）。

---

### Task 1: エラーの型・上限・`Encode`

**Files:**
- Create: `server/internal/workspace/encode.go`
- Create: `server/internal/workspace/encode_test.go`

**Interfaces:**
- Produces:
  - `type Error struct{ Key string }`、`func (e *Error) Error() string`（キーを返す）
  - 定数 `MaxLists = 100`、`MaxListName = 200`、`MaxWords = 1000`、`MaxWordText = 1000`、`MaxAnnotation = 2000`、`MaxRecords = 10000`、`MaxListsBytes = 896 << 10`
  - `func Encode(lists []List) ([]byte, error)`: `[{ "id", "name", "createdAt", "words": [{ "display", "input", "annotation" }], "records": [...] }]`。記録は `Record` の JSON タグどおり（`nil` の項目は書かない）。空のスライスは `[]`（`null` にしない）
  - `func CheckSize(before, after int) error`: `after > MaxListsBytes && after > before` のとき `&Error{Key: "workspaceTooLarge"}`
  - `func NewID() string`: UUID v4（`xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`）
  - `func FormatTime(t time.Time) string`: `t.UTC().Format("2006-01-02T15:04:05.000Z")`

- [ ] **Step 1: Write the failing tests**

```go
func TestEncodeRoundTrip(t *testing.T)        // Decode(既存の api_test の savedLists と同じ形の JSON) → Encode → Decode が同じ Lists（reflect.DeepEqual）
func TestEncodeDropsNulls(t *testing.T)       // `"mistakes": null`・`"device": null` を含む記録を Decode → Encode の出力に "null" が含まれない
func TestEncodeEmptySlices(t *testing.T)      // Records が nil のリストでも `"records":[]`
func TestCheckSize(t *testing.T)              // CheckSize(0, MaxListsBytes) == nil; CheckSize(0, MaxListsBytes+1) のキーが "workspaceTooLarge"; CheckSize(MaxListsBytes+10, MaxListsBytes+5) == nil
func TestNewID(t *testing.T)                  // regexp `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` に合い、2回で違う値
func TestFormatTime(t *testing.T)             // 2026-10-10T11:00:00+09:00 → "2026-10-10T02:00:00.000Z"
```

- [ ] **Step 2: Run** `go test ./internal/workspace/` — Expected: FAIL（未定義）
- [ ] **Step 3: Implement** 上の Interfaces を `encode.go` に。`Encode` は `List` に JSON タグがないため、タグ付きの非公開の構造体に詰め替えて `json.Marshal` する。`json.Marshal` の HTML エスケープは `json.Encoder.SetEscapeHTML(false)` で切り、末尾の改行は落とす（アプリの `JSON.stringify` と同じ大きさで測るため）。
- [ ] **Step 4: Run** `go test ./internal/workspace/` — Expected: PASS
- [ ] **Step 5: Commit** `git commit -m "feat: Go API のワークスペースを保存の形に書き出す"`

---

### Task 2: リストの作成・変更・削除

**Files:**
- Create: `server/internal/workspace/lists.go`
- Create: `server/internal/workspace/lists_test.go`

**Interfaces:**
- Consumes: Task 1 の `Error`・定数・`FormatTime`、既存の `length`・`Workspace.Find`
- Produces:
  - `type ListInput struct { Name *string \`json:"name"\`; Words []Word \`json:"words"\` }`（`Word` は既存。`annotation` の省略は `""`）
  - `func CreateList(w *Workspace, input ListInput, id string, now time.Time) (*List, error)`: 末尾に追加し、追加した要素へのポインタを返す。`Records` は空、`CreatedAt` は `FormatTime(now)`
  - `func UpdateList(w *Workspace, id string, input ListInput) (*List, error)`: `Name` が非 nil なら名前、`Words` が非 nil なら単語を全体置き換え
  - `func DeleteList(w *Workspace, id string) error`
  - リストがないときのキーは `listNotFound`

検証の順序（作成）: `listLimit`（`len(w.Lists) >= MaxLists`）→ 名前（nil または空白だけで `listNameRequired`）→ 重複名 `listNameDuplicate` → 単語（nil または0件で `wordsRequired`）→ `wordFieldsRequired` → 長さ `invalidList`。変更は `listNotFound` → 与えられた項目だけ同じ順で検証。`UpdateList` で `Name`・`Words` がどちらも nil の判定は API 側（Task 5）。

- [ ] **Step 1: Write the failing tests**（各テストは小さなワークスペース `{l1 "英単語", l2 "Fruits"}` から始める）

```go
func TestCreateList(t *testing.T)               // 名前 "  動物  " → Name "動物"、ID・CreatedAt "2026-10-20T00:00:00.000Z"、末尾、Records が空で非 nil、単語の前後空白が残る、annotation 省略で ""
func TestCreateListErrors(t *testing.T)         // テーブル: Name nil / "  " → listNameRequired; "fruits" → listNameDuplicate; Words nil / [] → wordsRequired;
                                                //   display "  " → wordFieldsRequired; 名前201文字・単語1001件・display 1001・annotation 2001 → invalidList;
                                                //   名前200文字の "𩸽"（UTF-16 で2単位）を101個 → invalidList; 100件ある状態 → listLimit。どれも w.Lists が変わらない
func TestUpdateList(t *testing.T)               // Name だけ → 単語と記録・CreatedAt・位置が残る; Words だけ → 名前と記録が残る; l2 を "FRUITS"（自分の名前の大文字違い）にできる
func TestUpdateListErrors(t *testing.T)         // 未知の id → listNotFound; Words [] → wordsRequired（Review Focus）; ほかのリストの名前 → listNameDuplicate
func TestDeleteList(t *testing.T)               // l1 を消すと l2 だけ残る; 未知の id → listNotFound
```

エラーの確かめ方は `var e *Error; errors.As(err, &e) && e.Key == want`。

- [ ] **Step 2: Run** `go test ./internal/workspace/ -run 'List'` — Expected: FAIL
- [ ] **Step 3: Implement** `lists.go`
- [ ] **Step 4: Run** `go test ./internal/workspace/` — Expected: PASS
- [ ] **Step 5: Commit** `git commit -m "feat: Go API のリストの作成・変更・削除を検証する"`

---

### Task 3: 記録の追加

**Files:**
- Create: `server/internal/workspace/records.go`
- Create: `server/internal/workspace/records_test.go`

**Interfaces:**
- Consumes: Task 1 の `Error`・`MaxRecords`・`FormatTime`、既存の `ParseTime`・`Record`・`Device`・`defaultDeviceID`
- Produces:
  - `type RecordInput struct { ID *string \`json:"id"\`; Time *float64 \`json:"time"\`; Date *string \`json:"date"\`; Mistakes *float64 \`json:"mistakes"\`; Accuracy *float64 \`json:"accuracy"\`; WordCount *float64 \`json:"wordCount"\`; DeviceID *string \`json:"deviceId"\` }`
  - `func AddRecord(w *Workspace, listID string, input RecordInput, newID string) (Record, bool, error)`: 追加したら `(記録, true, nil)`、同じ `id` があれば `(保存済みの記録, false, nil)`。`input.ID` が nil なら `newID` を使う

検証の順序: `listNotFound` → 値（`time` が nil・負・非有限、`date` が nil・`ParseTime` で読めない、`mistakes` が nil・負・非整数、`accuracy` が nil・0〜100の外・非有限、`wordCount` が 1未満・非整数、`id` の形）→ `invalidRecord` → 同じ `id` があれば保存済みを返す → `recordLimit`（`len(Records) >= MaxRecords`）→ `deviceId`（登録済み → コピー、`default` → 組み込み、ほか → `deviceNotFound`）→ 追加。保存する `Date` は `FormatTime(ParseTime(date))`、`At` も設定する。`wordCount` 省略時は `len(list.Words)`。

- [ ] **Step 1: Write the failing tests**

```go
func TestAddRecord(t *testing.T)            // id 省略 → newID; Date "2026-10-10T11:00:00+09:00" → "2026-10-10T02:00:00.000Z"（Review Focus）; WordCount 省略 → 単語数;
                                            //   deviceId "d1" → 登録済みの端末をコピー; "default" → {default デフォルト ""}; DeviceID nil → Device nil; 末尾に追加され added == true
func TestAddRecordSameID(t *testing.T)      // id "run-1" を2回、2回目は time を変える → 2回目は (1回目の記録, false, nil)、Records は1件（Review Focus）
func TestAddRecordErrors(t *testing.T)      // テーブル: 未知のリスト → listNotFound; time -1 / nil; date "abc"; mistakes 1.5（Review Focus）/ -1 / nil; accuracy 100.5 / nil;
                                            //   wordCount 0 / 1.5; id "" / "a b" / 101文字 → invalidRecord; deviceId "zz" → deviceNotFound;
                                            //   記録が MaxRecords 件のリストに新しい id → recordLimit、同じ id の再送 → (保存済み, false, nil)
```

- [ ] **Step 2: Run** `go test ./internal/workspace/ -run Record` — Expected: FAIL
- [ ] **Step 3: Implement** `records.go`
- [ ] **Step 4: Run** `go test ./internal/workspace/` — Expected: PASS
- [ ] **Step 5: Commit** `git commit -m "feat: Go API の記録の追加を検証する"`

---

### Task 4: `store.Modify` と書き込み可能な接続

**Files:**
- Modify: `server/internal/store/store.go`（`Open` と `Modify`、パッケージのコメント）
- Modify: `server/internal/store/store_test.go`
- Modify: `server/cmd/typle-api/main.go`（`store.Open(open, connection, false)` に合わせるだけ。フラグは Task 6）

**Interfaces:**
- Consumes: Task 1 の `Encode`・`CheckSize`・`Error`、既存の `workspace.Decode`・`workspace.Initial`
- Produces:
  - `func Open(ctx context.Context, connection string, writable bool) (*Store, error)`: `writable` が false のときだけ `default_transaction_read_only=on`
  - `func (s *Store) Modify(ctx context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error)`: 変更後のワークスペースを返す。`change` のエラー・`CheckSize` のエラーはそのまま（`*workspace.Error`）返す

流れは spec の「保存の流れ」1〜5 のとおり。`pgx.BeginFunc` を使い、行がないときは `INSERT INTO typle_workspaces (owner_id, lists, devices) VALUES ($1, $2::jsonb, '[]'::jsonb) ON CONFLICT (owner_id) DO NOTHING`（`$2` は `Encode(Initial().Lists)`）のあと `SELECT … FOR UPDATE` をもう一度行う。大きさは `CheckSize(len(Encode(変更前)), len(Encode(変更後)))`。`UPDATE typle_workspaces SET lists = $2::jsonb, revision = revision + 1, updated_at = now() WHERE owner_id = $1`。

- [ ] **Step 1: Write the failing tests**（既存の `database`・`owner` を使う）

```go
func TestModifyCreatesRow(t *testing.T)        // 行がない owner に DeleteList("sample-1") → 返り値と Read の結果に sample-1 がなく残りの初期リストがある、revision == 2（INSERT で1、UPDATE で2）
func TestModifyIncrementsRevision(t *testing.T) // 既存の行に2回 Modify → revision が1ずつ増え、updated_at が進む
func TestModifyUnchanged(t *testing.T)         // change が (false, nil) → revision・lists が変わらない（Review Focus の同じ id の再送）
func TestModifyError(t *testing.T)             // change が &workspace.Error{Key: "listNameDuplicate"} → そのエラー、行が変わらない
func TestModifyTooLarge(t *testing.T)          // 大きな単語のリストを足して MaxListsBytes を超える → workspaceTooLarge、行が変わらない
func TestModifyConcurrent(t *testing.T)        // 行がない owner に10個の goroutine が別々の名前で CreateList → すべて成功し、Read に10件すべてある
func TestReadOnlyRefusesWrites(t *testing.T)   // Open(…, false) の Modify はエラー（*workspace.Error ではない）、行が変わらない
```

- [ ] **Step 2: Run** `go test ./internal/store/` — Expected: FAIL（`Modify` 未定義、`Open` の引数）
- [ ] **Step 3: Implement** `store.go` と `main.go` の呼び出し
- [ ] **Step 4: Run** `go test ./...`（`TYPLE_TEST_DATABASE_URL` を付けて）— Expected: PASS、store のテストが skip されない
- [ ] **Step 5: Commit** `git commit -m "feat: Go API のストアでワークスペースを行ロックして書き込む"`

---

### Task 5: 書き込みのエンドポイント

**Files:**
- Modify: `server/internal/api/api.go`
- Create: `server/internal/api/write.go`（本文の読み込み・書き込みのハンドラー・エラーの変換）
- Modify: `server/internal/api/api_test.go`（`New` の呼び出しを合わせる）
- Create: `server/internal/api/write_test.go`
- Modify: `server/cmd/typle-api/main.go`（`api.New(source, nil, auth.NewGitHub())`）

**Interfaces:**
- Consumes: Task 2・3 の関数と入力型、Task 1 の `NewID`・`Error`、Task 4 の `Modify` の形
- Produces:
  - `type Writer interface { Modify(ctx context.Context, owner string, change func(*workspace.Workspace) (bool, error)) (*workspace.Workspace, error) }`
  - `func New(source Source, writer Writer, verifier Verifier) http.Handler`: `writer` が nil なら読み取り専用（spec の `writable bool` の代わり。nil で同じ意味を表す）

ルーティング: パスごとに許すメソッドの集合を持ち、集合外は `405` と `Allow`（spec の表どおり。`writer` が nil なら書き込みのメソッドを集合に入れない）。認証は今の `read` と共通の関数に切り出し、書き込みは認証 → 本文 → `Modify` の順。本文は `http.MaxBytesReader(w, r.Body, 1<<20)` と `json.Decoder.DisallowUnknownFields`。`*T` に読んで nil（`null`）なら `invalidJson`、2つ目の値が `io.EOF` でなければ `invalidJson`、`*http.MaxBytesError` は `413 requestTooLarge`。`Content-Type` は `mime.ParseMediaType` で `application/json` か確かめる。`PATCH` で `Name`・`Words` がどちらも nil なら `invalidJson`。

エラーの変換: `*workspace.Error` のキーが `listNotFound` → 404、`workspaceTooLarge` → 413、ほか → 400。それ以外のエラーはログに出して `503 databaseUnavailable`。

応答: 作成 `201 { "list": listDetail }`、変更 `200 { "list" }`、削除 `204`（本文なし。`respond` を使わず `Cache-Control: no-store` だけ付けて `WriteHeader`）、記録 `201`/`200 { "record" }`。新しい ID・時刻はハンドラーで `workspace.NewID()`・`time.Now()` を作って変更の関数に渡す。

- [ ] **Step 1: Write the failing tests**（偽の `writer` は `source` と同じワークスペースに `change` を適用し、呼ばれた owner と回数を覚える）

```go
func TestCreateList(t *testing.T)          // POST /api/v1/lists {"name":"動物","words":[{"display":"cat","input":"cat"}]} → 201、list.name "動物"、wordCount 1、recordCount 0、id が UUID、Content-Type JSON
func TestUpdateList(t *testing.T)          // PATCH /api/v1/lists/l1 {"name":"English"} → 200、words は元の2件
func TestDeleteList(t *testing.T)          // DELETE /api/v1/lists/l2 → 204、本文が空、続く GET /api/v1/lists/l2 → 404 listNotFound
func TestAddRecord(t *testing.T)           // POST /api/v1/lists/l1/records {"id":"r9","time":3,"date":"2026-10-12T00:00:00Z","mistakes":0,"accuracy":100} → 201、record.date "2026-10-12T00:00:00.000Z"; 同じ本文をもう一度 → 200
func TestReadOnlyRefusesWrites(t *testing.T) // writer nil で POST /api/v1/lists → 405、Allow "GET, HEAD"、writer は呼ばれない
func TestAllowHeaders(t *testing.T)        // writer ありで PUT を各パスへ → 405 と spec の Allow（devices "GET, HEAD"、lists "GET, HEAD, POST"、lists/l1 "GET, HEAD, PATCH, DELETE"、records "GET, HEAD, POST"）
func TestWriteBodyErrors(t *testing.T)     // テーブル: Content-Type text/plain → 415 unsupportedContentType; "application/json; charset=utf-8" は通る;
                                           //   1MiB+1 バイト → 413 requestTooLarge; "null" と ""（Review Focus）・"{" ・`{"name":"a","x":1}`・`{} {}` → 400 invalidJson;
                                           //   PATCH `{}` → 400 invalidJson。どれも writer の変更が保存されない
func TestWriteErrorStatuses(t *testing.T)  // 重複名 → 400 listNameDuplicate; 未知のリストへ PATCH → 404 listNotFound; mistakes 1.5 → 400 invalidRecord（Review Focus）;
                                           //   writer が workspaceTooLarge → 413; writer が普通のエラー → 503 databaseUnavailable
func TestWriteAuthFirst(t *testing.T)      // トークンなしで巨大・不正な本文の POST → 401 invalidToken（本文を読まない）; "down" → 503 githubUnavailable
func TestWriteOwnAccount(t *testing.T)     // bob のトークンで POST → writer の owner が "github:2"
```

- [ ] **Step 2: Run** `go test ./internal/api/` — Expected: FAIL
- [ ] **Step 3: Implement** `write.go` と `api.go` のルーティング
- [ ] **Step 4: Run** `gofmt -l . && go vet ./... && go test ./...` — Expected: 出力なし・PASS（既存の読み取りのテストも通る）
- [ ] **Step 5: Commit** `git commit -m "feat: Go API にリストと記録の書き込みのエンドポイントを追加する"`

---

### Task 6: `-writable`・ドキュメント・バージョン

**Files:**
- Modify: `server/cmd/typle-api/main.go`
- Modify: `docs/api.md`、`README.md`（Go API の段落2か所）、`.github/workflows/*.yml`（「The read-only Go API」のコメントを「The Go API」に）
- Modify: `package.json`・`package-lock.json`（`0.42.0`）

**Interfaces:**
- Consumes: Task 4 の `Open(…, writable)`、Task 5 の `New(source, writer, verifier)`

- [ ] **Step 1: Implement** `-writable` フラグ（`flag.Bool("writable", false, "accept writes: create, change and delete lists and add records")`）。true なら `store.Open(…, true)` と `api.New(source, source, …)`、false なら `Open(…, false)` と `api.New(source, nil, …)`。起動ログは `serving workspaces read-only to their GitHub accounts on …` / `serving workspaces read-write to …`。パッケージのコメントも読み書きに。
- [ ] **Step 2: Verify by running it**: Setup の DB で `go run ./cmd/typle-api` を起動し、 `curl -X POST -H 'Authorization: Bearer x' http://127.0.0.1:8080/api/v1/lists` → `405`、`Allow: GET, HEAD` を確かめる。`-writable` 付きでは同じ要求が `401 invalidToken`（認証まで進む）になることを確かめる。
- [ ] **Step 3: Docs** `docs/api.md` を spec の「エンドポイント」「エラー」「保存の流れ」（利用者に見える部分: アプリの画面は次の保存で読み込み直す、DB ロールに `INSERT`・`UPDATE` の権限が要る）に合わせて書き換え、書き込みの `curl` の例（リスト作成・記録追加）を足し、「範囲外」から書き込みを外す。README の2段落を「API（Go）」の読み書きに。`npm version 0.42.0 --no-git-tag-version`。
- [ ] **Step 4: Verify** `cd server && gofmt -l . && go vet ./... && go test ./...`、`cd .. && npm test && npm run lint` — Expected: すべて PASS
- [ ] **Step 5: Commit** `git commit -m "feat: Go API を -writable で読み書きできるようにする（v0.42.0）"`
