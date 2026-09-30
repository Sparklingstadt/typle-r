import type { Metadata } from "next"
import Link from "next/link"
import { BookOpen, ChevronRight, ExternalLink, Keyboard, Plus, Trophy, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import StorageComparison from "@/components/About/StorageComparison"
import packageJson from "../../../package.json"

export const metadata: Metadata = {
  title: "Typleについて | Typle",
  description: "Typleでできること、データの保存先、不具合の報告で送る情報、バージョンをまとめています。",
}

const features: { title: string; path: string; icon: LucideIcon; description: string }[] = [
  { title: "リストを作成", path: "/create", icon: Plus, description: "覚えたい単語を登録します。表示する単語と入力する文字は別々に指定でき、CSV・TSVからも追加できます。" },
  { title: "練習する", path: "/play", icon: Keyboard, description: "速度・正確率・ミス数をその場で表示し、違う文字を打った位置も示します。" },
  { title: "ベスト記録", path: "/rankings", icon: Trophy, description: "自己ベストと直近5回の平均、所要時間の推移で上達を確かめられます。" },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="text-base font-bold">{title}</h2>
    {children}
  </section>
}

export default function About() {
  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-10 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Typleについて</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">自分で作った単語リストで練習できるタイピングアプリです。好きな言葉を登録して練習し、ベスト記録で上達を振り返れます。</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />練習する</Link></Button>
        <Button asChild variant="outline"><Link href="/guide"><BookOpen aria-hidden="true" />使い方</Link></Button>
      </div>
    </header>

    <div className="space-y-10">
      <Section id="features-heading" title="できること">
        <ul className="grid gap-3 sm:grid-cols-3">
          {features.map(({ title, path, icon: Icon, description }) => <li key={path}
            className="relative flex gap-3 rounded-xl border bg-card p-4 pr-10 transition-colors has-[a:hover]:border-foreground/25 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 sm:block sm:pr-4">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground sm:mb-3"><Icon className="size-4" /></span>
            <div className="min-w-0">
              <h3 className="font-bold">
                <Link href={path} className="outline-none after:absolute after:inset-0 after:rounded-xl">{title}</Link>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <ChevronRight aria-hidden="true" className="absolute top-4 right-3 size-4 text-muted-foreground sm:top-6 sm:right-4" />
          </li>)}
        </ul>
      </Section>

      <Section id="storage-heading" title="データの保存先">
        <p className="max-w-2xl text-sm text-muted-foreground">ログインは任意です。ログインしているかどうかで保存先が変わり、2つのデータは別々に保存されます（自動では移行しません）。</p>
        <StorageComparison />
        <p className="text-sm"><Link href="/guide#storage" className="underline underline-offset-3 hover:text-muted-foreground">使い方の「保存について」</Link>に詳しい説明があります。</p>
      </Section>

      <Section id="reports-heading" title="不具合の報告">
        <p className="max-w-2xl text-sm text-muted-foreground">不具合を調べるため、エラーの内容と発生した環境（ブラウザー・OSなど）を送信することがあります。送信の前に、単語リストなどのリクエストの内容・Cookie・ユーザー情報・操作の履歴を取り除きます。</p>
      </Section>

      <Section id="version-heading" title="バージョンと開発">
        <dl className="divide-y rounded-xl border bg-card text-sm">
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">バージョン</dt>
            <dd className="font-medium tabular-nums">{`v${packageJson.version}`}</dd>
          </div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">使用している技術</dt>
            <dd>Next.js・React・PostgreSQL（Neon）</dd>
          </div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">ソースコード</dt>
            <dd className="space-y-0.5">
              <a href="https://github.com/Sparklingstadt/typle-r" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-3 hover:text-muted-foreground">
                GitHub<span className="sr-only">（新しいタブで開く）</span><ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
              <p className="text-muted-foreground">非公開のリポジトリです。閲覧を許可されたGitHubアカウントでのみ開けます。</p>
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  </main>
}
