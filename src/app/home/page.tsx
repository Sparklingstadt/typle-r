"use client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import LegacyImport from "@/components/LegacyImport"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import { useWordLists } from "@/lib/useWordLists"

export default function Home() {
  const { lists, ready, error, saving, update } = useWordLists()
  const count = lists.reduce((total, list) => total + list.records.length, 0)
  return <Page><PageContainer>
    <h1 className="text-3xl mb-4">自分の単語で、タイピング練習。</h1>
    <p className="mb-6">サンプルで練習を始めるか、覚えたい単語のリストを作成しましょう。</p>
    {error && <Alert variant="destructive" className="my-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {ready && <div className="flex flex-wrap gap-3 mb-6"><Badge variant="secondary">単語リスト {lists.length} 件</Badge><Badge variant="secondary">完了した練習 {count} 回</Badge></div>}
    <nav aria-label="はじめる" className="flex gap-4 flex-wrap">
      <Button asChild><Link href="/play">練習する</Link></Button>
      <Button asChild variant="outline"><Link href="/create">リストを作成</Link></Button>
      <Button asChild variant="outline"><Link href="/records">記録を見る</Link></Button>
    </nav>
    <p className="mt-8">ログインせずにすべての練習・編集機能を利用できます。単語リスト・練習記録・端末はこのブラウザーに保存されます。GitHubでログインすると、別の保存先であるアカウントに切り替わり、端末間で同期できます。ブラウザーのデータは自動で移行されません。</p>
    <LegacyImport update={update} disabled={!ready || saving} />
    <p className="mt-4"><Link className="underline" href="/guide">使い方</Link> ／ <Link className="underline" href="/about">Typleについて</Link></p>
  </PageContainer></Page>
}
