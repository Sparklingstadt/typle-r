# Sentry エラー監視

ブラウザーの未処理例外、React の全体エラー画面、Next.js のサーバー例外、
`/api/workspace` の読み書きで捕捉した例外を収集します。
認証失敗・入力エラー・更新競合など、想定内の4xx応答は報告しません。

## 接続

Sentry で Next.js プロジェクトを作成し、Client Keys (DSN) の値を設定します。
ローカルでは `.env.local`、Vercel では対象環境の Environment Variables に設定してください。

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | ブラウザーとサーバーの送信先。未設定なら送信しません |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | ブラウザーの環境名（`production`、`preview`、`development`）。省略時は NODE_ENV |
| `SENTRY_DSN` | 任意のサーバー送信先上書き |
| `SENTRY_ENVIRONMENT` | サーバー環境名。省略時は VERCEL_ENV、次に NODE_ENV |
| `SENTRY_ORG` / `SENTRY_PROJECT` | ソースマップをアップロードする Organization / Project の slug |
| `SENTRY_AUTH_TOKEN` | ビルド時のソースマップアップロード用トークン |

`NEXT_PUBLIC_` の値はビルド時に埋め込まれるため、変更後は再ビルド・再デプロイしてください。
Vercel の Production と Preview で環境名をそれぞれ設定してください。
トークンに `NEXT_PUBLIC_` を付けたり、Git に保存したりしないでください。
トークン未設定でもビルドでき、DSN があればエラー収集は動きます。
ソースマップのアップロードはトークン設定時のみ有効です。設定する場合は3変数を揃えてください。
アップロードしたマップはビルド成果物から削除します。

## 収集する情報

エラー内容・スタックトレース・実行環境を収集します。ワークスペースAPIの例外には
`workspace.read` / `workspace.write` の操作タグを付けます。
リクエスト本文、ヘッダー、Cookie、URLのクエリー・フラグメント、ユーザー情報、
追加データ、操作履歴を送信前に除去します。Session Replay・性能トレースは無効です。
例外メッセージ自体は診断に必要なため残します。入力した単語や秘密情報を例外メッセージに含めないでください。

## 確認方法

1. Preview またはローカルに DSN を設定してビルド・起動します。
2. ブラウザーの開発者コンソールから `setTimeout(() => { throw new Error('Typle Sentry smoke test') }, 0)` を実行します。
3. Sentry の Issues でテスト例外・環境名・スタックを確認します。
4. サーバーはテスト用の一時的な Route Handler で例外を投げ、同様に到達を確認します。
   確認用ルートは公開前に削除してください。

実プロジェクトへの到達とソースマップ解決は、DSN・アップロード設定後に別途確認が必要です。
公式手順: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
