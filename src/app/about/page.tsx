import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"

export default function About() {
  return <Page><PageContainer>
    <h1 className="text-3xl mb-6">Typleについて</h1>
    <p>Typleは、自分で作った単語リストで練習できるタイピングアプリです。Next.jsとReactで開発しています。</p>
    <p className="my-4">GitHubアカウントで認証し、単語リストと練習記録をNeon PostgreSQLに保存します。データはログインした本人のみ利用できます。</p>
    <a className="underline" href="https://github.com/Sparklingstadt/typle-r">GitHubでソースコードを見る</a>
  </PageContainer></Page>
}
