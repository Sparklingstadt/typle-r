# 読み取り専用API（Go）設計

- 日付: 2026-10-19
- 対象バージョン: v0.37.0

## 目的

v0.36.0 でサーバー機能を削除した後の構成（ブラウザー保存だけ）を基準に、保存データを外から読むための読み取り専用APIをGoで作る。現段階では認証を付けない。

## 決定事項

| 項目 | 決定 |
|---|---|
| データ | 起動時に指定したワークスペースJSON（LocalStorageの `typle-r:guest-workspace:v1` の値そのまま）を読む。未指定や `revision: 0` は、アプリと同じく最初の単語リスト（`src/plugins/packs`）を返す |
| 配置 | `server/` の独立したGoモジュール（標準ライブラリだけ）。Vercelの本番・リリース手順には載せず、`.vercelignore` で送らない |
| エンドポイント | 旧 `/api/v1` の読み取りと同じ形の `GET /api/v1/devices`・`/lists`・`/lists/{l}`・`/lists/{l}/records`（`since`・`limit`）。`shared`・`shareUrl` はない |
| 認証 | なし。既定の待ち受けを `127.0.0.1` にし、文書で注意する |
| 検証 | アプリの `decodeLists`・`decodeDevices` と同じ規則。読めないデータ・10MiB超・プロファイルが残ったデータでは起動しない |
| CI | `verify` に `gofmt`・`go vet`・`go test` を追加する |

## 範囲外

認証、書き込み、起動中の再読み込み、ブラウザーとの同期、本番へのデプロイ。
