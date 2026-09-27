import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"

export default function About() {
  return <Page><PageContainer>
    <h1 className="text-3xl mb-6">Typleについて</h1>
    <p>Typleは、自分で作った単語リストで練習できるタイピングアプリです。Next.jsとReactで開発しています。</p>
    <p className="my-4">ログインなしで全機能を利用でき、単語リスト・練習記録・端末をこのブラウザー内に保存します。任意のGitHubログインでアカウント専用のNeon PostgreSQL保存に切り替わります。ブラウザー保存とアカウント保存は分離されています。</p>
    <a className="underline" href="https://github.com/Sparklingstadt/typle-r">GitHubでソースコードを見る</a>
  </PageContainer></Page>
}
