# 例と開発

## 例

```sh
curl -H "Authorization: Bearer $TYPLE_TOKEN" http://127.0.0.1:8080/api/v1/lists
curl -H "Authorization: Bearer $TYPLE_TOKEN" \
  "http://127.0.0.1:8080/api/v1/lists/$LIST_ID/records?since=2026-10-01T00:00:00Z&limit=20"

# -writable で起動したとき
curl -H "Authorization: Bearer $TYPLE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"動物","words":[{"display":"猫","input":"neko","annotation":"cat"}]}' \
  http://127.0.0.1:8080/api/v1/lists
curl -H "Authorization: Bearer $TYPLE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"run-2026-10-20-001","time":12.3,"date":"2026-10-20T21:00:00+09:00","mistakes":1,"accuracy":98.5}' \
  "http://127.0.0.1:8080/api/v1/lists/$LIST_ID/records"
```

## コードの構成

モジュールはリポジトリ直下の `go.mod`、パッケージは `server/` の下です。`/api/v1` とアプリ自身のバックエンド（v0.55.0 から。GitHubログイン・`/api/workspace`・`/api/health`）が `internal/store`・`internal/workspace`・`internal/auth` を共有します。

| 場所 | 内容 |
|---|---|
| `server/cmd/typle-api` | この API（`/api/v1`）を起動するコマンド。本番には載せない |
| `server/cmd/typle-web` | アプリのバックエンドを手元で起動するコマンド（既定 `127.0.0.1:8081`）。`npm run dev` と E2E が使う |
| `server/internal/api` | `/api/v1` のHTTPハンドラー（`api.go` がパスの一覧） |
| `server/internal/auth` | GitHubのトークンからアカウントを確かめる（`/api/v1`）。アプリのログイン用の GitHub OAuth クライアントもここにある |
| `server/internal/store` | `typle_workspaces` の読み書き（`/api/v1` の行ロック方式と、アプリの `revision` による更新） |
| `server/internal/workspace` | 保存データの検証とリスト・記録・端末の変更 |
| `server/internal/operation` | 記録の追加・変更・削除（アプリのAPIと共通） |
| `server/internal/web` | アプリのバックエンドのHTTPハンドラー（[アプリのAPI](/app/)）。Cookie は `server/internal/session` で署名する |
| `server/vercel` | `internal/web` を Vercel の Go の関数（リポジトリ直下の `api/*.go`）から呼ぶ橋渡し |

## 開発

```sh
gofmt -l .
go vet ./...
TYPLE_TEST_DATABASE_URL=postgresql://typle:…@127.0.0.1:5432/typle go test ./...
```

DBのテスト（読み取りと書き込み）は、`npm run db:migrate` 済みのテスト用DBを `TYPLE_TEST_DATABASE_URL` で指定したときだけ実行します（ランダムなアカウントIDの行を作って、終わったら消します）。CIの `verify` は `db:migrate` の後に同じ確認をします。

::: danger
`TYPLE_TEST_DATABASE_URL` に本番のDBは指定しないでください。
:::

公式パックの単語リストは `src/plugins/packs` が原本で、`npm run packs:generate`（または `go generate ./server/internal/workspace`）で `server/internal/workspace/packs` に埋め込み用のコピーを作ります（v1.5.0 から）。生成し忘れは `go test` と単体テストで分かります。

## 範囲外

- GitHub 以外の認証、ブラウザーでのログイン画面、許可するユーザーの制限
- ローカルの開発用ログインのアカウント（`github:0`）。GitHub のトークンでは名乗れない
- `id` のない記録の変更・削除、記録の別のリストへの移動、パック・端末の並べ替え、単語単位の追加・削除（リストはパックの中で `listOrder` で並べ替えられる）
- 公式パックのフォロー（カタログからの追加）、リンクでの共有
- トークンごとの読み取り・書き込みの区別（書き込みはサーバーの `-writable` で決める）
- ブラウザー保存のデータ
