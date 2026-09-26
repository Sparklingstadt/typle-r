import Link from "next/link"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"

export default function Guide() {
  return <Page><PageContainer>
    <h1 className="text-3xl mb-8">使い方</h1>
    <section className="mb-8 space-y-3"><h2 className="text-xl">1. 練習する</h2>
      <p>「遊ぶ」で単語リストを選択し、表示された入力用の文字をタイプします。正しい文字は緑、違う文字は赤で示します。誤入力はBackspaceで修正してください。</p>
      <p>すべての文字が一致すると次の単語へ進み、最後の単語で完了します。最初の入力から完了までを計時します。日本語はIMEで確定した文字で判定します。貼り付けとドラッグ入力は使えません。</p>
      <p>「最初からやり直す」またはリスト切り替えで進行をリセットします。途中までの練習は記録しません。</p>
    </section>
    <section className="mb-8 space-y-3"><h2 className="text-xl">2. 自分の単語を追加する</h2>
      <p>「作成」でリスト名、表示する単語、入力する文字を入力します。表示と入力には異なる文字を指定でき、補足は任意です。単語の追加・削除・並べ替えができます。</p>
      <p>「保存」で確定します。「編集」で既存のリストを変更でき、キャンセルすれば変更を保存しません。空のリストや同じ名前のリストは保存できません。</p>
      <p>「編集」の各リストにある「CSVエクスポート」で、入力・表示・補足をUTF-8のCSVファイルに保存できます。練習記録は含みません。「作成」「編集」のCSV取り込みで再利用できます（取り込みは1 MiB以内・1,000単語まで）。</p>
    </section>
    <section className="mb-8 space-y-3"><h2 className="text-xl">3. 結果と記録を見る</h2>
      <p>完了すると所要時間、ミス文字数、正確率を表示し、自動保存します。正確率は入力した文字のうち正しかった文字の割合です。削除操作は文字数に含めず、訂正して再入力した文字は含めます。</p>
      <p>「記録」で履歴を確認・削除できます。「ベスト記録」にはリストごとの上位5件を表示します。保存に失敗した場合は完了画面の「記録の保存を再試行」を押してください。</p>
    </section>
    <section className="space-y-3"><h2 className="text-xl">保存について</h2>
      <p>GitHubアカウントでログインすると、単語リストと記録をサーバーに保存します。他の利用者には公開しません。保存にはインターネット接続が必要です。以前のブラウザー内のデータはホームの移行ボタンで追加できます。</p>
      <p>リストを削除すると、そのリストの記録も削除されます。複数の画面で同時に変更した場合は最新のデータを読み込み、再試行をお願いします。</p>
    </section>
    <p className="mt-8"><Link href="/play" className="underline">練習を始める</Link></p>
  </PageContainer></Page>
}
