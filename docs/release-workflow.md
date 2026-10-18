# PRから本番公開まで

必須順序: **PR作成 → squash merge → マージ後のverify → GitHub Release → Vercel本番デプロイ**。

`.github/workflows/ci.yml` の `policy → verify → release → deploy` が順番を制御します。
PR・devへのpush・手動実行は検証のみで、公開はmainへのpushイベントに限定します。
PR時のverifyに合格しても、マージ後のverifyは必ず再実行します。
Releaseイベントで別のworkflowを起動する方式ではないため、GITHUB_TOKENで作ったReleaseから
別のworkflowが起動しない制限にも依存しません。

## 初回設定（このファイルの追加だけでは完了しません）

1. GitHubの **Settings → General → Pull Requests** で、Allow squash mergingだけを有効にし、
   Allow merge commitsとAllow rebase mergingを無効にします。policyでもこの状態を確認します。
2. **Settings → Rules → Rulesets** でmainを対象とした有効なルールを作ります。
   PR必須、required status checkに`verify`、ブランチを最新にすることを必須にし、
   linear history必須、force push・削除禁止、bypass対象なしを設定します。
   初回PRでcheckが出てから`verify`を選択してください。
   private repoのプラン等によりルールを強制できない場合、YAMLだけでは直接pushを禁止できません。
   policyは直接push後の公開を拒否しますが、pushそのものを取り消す機能ではありません。
3. **Settings → Environments** で`production`を作成し、deployment branchをmainに限定します。
   以下の3つをEnvironment secretsへ登録します（repository secretsでも動作します）。
   - `VERCEL_TOKEN`: 対象チームを操作できる90日期限のトークン（CLIの制約によりチームスコープを使用）。
   - `VERCEL_ORG_ID`: 対象チームID。
   - `VERCEL_PROJECT_ID`: 対象プロジェクトID。
   IDは対象のVercel設定や、正しく紐付け済みの`.vercel/project.json`で確認します。
   `.vercel/`やトークンをコミットする必要はありません。
4. Actionsが利用可能で、workflowの`contents: write`が組織ポリシー等で禁止されていないことを確認します。
   Release作成にはジョブのGITHUB_TOKENを使うため、GitHub PATは不要です。
5. DB・Authの環境変数は不要です（v0.36.0でサーバー機能を削除しました）。任意の設定はREADMEの「Vercelの構成」を参照してください。
   公開先は`https://typle-r-six.vercel.app`を想定しています。
6. `vercel.json`の`git.deploymentEnabled: false`を維持します。
   別のデプロイworkflow・Deploy Hook・手動CLIによる公開は併用しません。

管理者によるルール変更や手動Release・Vercel操作までYAMLだけで禁止することはできません。
書き込み権限とVercel権限も、この運用に従う利用者・自動化に限定してください。

## 現在の導入状態

2026-09-29時点で、非公開repoのプラン制限によりmainのRulesets・branch protection APIは403です。
squash限定とproduction Environmentのmain限定は利用できます。
現プランではmainへの直接push自体は防げませんが、policyでRelease・deployを拒否します。
GitHub Proへ変更した場合は、上記のmain保護ルールを追加してください。
CI用Vercelトークンは90日期限で作成しています。期限前にSecretを更新してください。
本番ビルドのNode.jsはVercelプロジェクトと同じ24系を使います。

## 毎回の開発

1. mainから作業ブランチを作り、コード変更とバージョン更新を行います。
   `npm version 0.18.2 --no-git-tag-version`のように、未使用の安定版`X.Y.Z`を指定します。
   package.jsonとpackage-lock.jsonを両方コミットしてください。
2. PRを作成し、verifyの結果と変更内容を確認します。
3. squash mergeします。前のmainのRelease・デプロイが完了するまでは次のPRをマージしません。
4. マージ後のpolicyがPRとの対応・1コミットのpush・1親コミット・squash専用設定を確認します。
5. verifyが型チェック・単体テスト・Lint・ビルド・E2Eを実行します。
   E2E用のChromiumはPlaywrightのバージョンごとにActionsのキャッシュに保存し、OSの依存パッケージだけ毎回入れます。
6. 成功したSHAに対して`v<package.jsonのversion>`のタグと公開済みの通常Releaseを作ります。
   Release notesはGitHubの自動生成を使います。公開済みとは非draftの意味で、repoの非公開設定は変えません。
7. 同じSHAをチェックアウトし、ReleaseのタグのSHAを再確認します。
   Vercel CLI 60.1.3の`vercel deploy --prod`でソースを送り、Vercel内で本番ビルド・デプロイします。
   CLIはバージョンごとにmainのキャッシュに保存します。版を上げるときは`ci.yml`の`VERCEL_CLI_VERSION`だけを変えます。
   読み出し不可のSecretが`[SENSITIVE]`になるため、Actionsでは`vercel pull`・`vercel build`を行いません。
8. 本番ホームの成功応答と、削除したAPI（`/api/workspace`）が404であることを確認します。

deployから起動するVercel上のビルドは本番環境変数を使います。DBはないため、migrationはありません。

## 失敗時

- policyまたはverify失敗: Releaseとデプロイは実行されません。
- Release作成失敗: デプロイは実行されません。
- deploy失敗: 先に作成したReleaseは残ります。Releaseの存在だけでは本番反映成功を意味しません。
- 認証・通信などの一時的な問題: 原因を直して同じActions実行の失敗ジョブを再実行します。
  既存Releaseは非draft・非prerelease・同じタグ・同じSHAの場合だけ再利用します。
  タグを移動したり、同じバージョンを別コミットに使ったりしません。
- コード修正が必要: 新しいバージョンで修正PRを作り、同じ順序で公開します。
- mainが進んだ古い実行: Release作成・deployは拒否します。古い実行を再実行して巻き戻しません。
- HTTPチェックだけ失敗: デプロイ済みの可能性があるため、実際の公開状態を確認してから復旧します。

workflow全体はmainごとに直列化し、実行中の公開を新しいpushでキャンセルしません。
待機中の実行は追加pushで置き換わる場合があります。また、mainが先に進んだ実行は上記の通り停止します。
常に1件ずつマージから公開完了まで進めてください。

## 検証と参考資料

設定変更時: `node --test scripts/ci/release.test.cjs` と `actionlint` を実行します。
実際のGitHub権限・Secrets・Vercel本番デプロイは、設定後の最初の承認済みPRで確認します。

- [GitHub Actionsのジョブ依存関係](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Actionsの同時実行制御](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [VercelとGitHub Actions](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
