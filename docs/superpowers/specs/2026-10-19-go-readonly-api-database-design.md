# 読み取り専用API（Go）をDBから読む設計

- 日付: 2026-10-19
- 対象バージョン: v0.39.0
- 前提: PR #51（GitHubログインとクラウド保存を戻す。`docs/superpowers/specs/2026-10-19-restore-login-design.md`）の上に積む。v0.37.0 の読み取り専用API（`docs/superpowers/specs/2026-10-19-go-readonly-api-design.md`）を作り直す

## 目的

v0.37.0 のGo APIは、ブラウザーからコピーしたワークスペースのJSONファイルを読んでいた。PR #51 でクラウド保存が戻るため、アカウントの保存データ（`typle_workspaces`）をDBから直接読むように作り直す。読み取り専用で、現段階では認証を付けない。

## 決定事項

| 項目 | 決定 |
|---|---|
| データ | `DATABASE_URL`（なければ `POSTGRES_URL`。アプリと同じ）の `typle_workspaces` を、リクエストごとに読む。JSONファイルの読み込み（`-data`）は削除する |
| アカウント | 起動時の `-owner`（例: `github:12345`）で1アカウントに固定する。パスは `/api/v1/…` のまま |
| 読み取り専用 | HTTPは `GET`・`HEAD` だけ。DB接続は `default_transaction_read_only=on` |
| 行がないとき | アプリと同じく最初の単語リスト（`src/plugins/packs`） |
| 接続のTLS | アプリの `strictSslUrl` と同じく `prefer`・`require`・`verify-ca` を `verify-full` にする |
| ドライバー | pgx v5.9.2。Neonの接続文字列の `channel_binding` を扱うため。Go の最低バージョンは 1.25 |
| エラー | DBの障害と読めない保存データは `503 databaseUnavailable`（v0.35.x の `/api/v1` と同じキー） |
| CI | `verify` の `db:migrate` の後に `gofmt`・`go vet`・`go test` を実行し、`TYPLE_TEST_DATABASE_URL` でDBのテストも行う |
| 配置 | `server/` の独立したGoモジュールのまま。Vercelの本番には載せない |

## 範囲外

認証、書き込み、ブラウザー保存のデータ、1プロセスでの複数アカウント、本番へのデプロイ。
