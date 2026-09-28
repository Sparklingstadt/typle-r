"use client"
import { Fragment, useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { Check, Clock, Keyboard, Minus, Plus, Sparkles, Target, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import TrendChart from "@/components/Dashboard/TrendChart"
import {
  accuracyScale, durationParts, formatDay, formatDuration, formatWeekday, listTrends, nextLists, speedScale, summarize, addDays,
  LOW_ACCURACY, STALE_DAYS, type Change, type ListTrend, type NextList, type Scale, type Trend,
} from "@/lib/dashboard"
import type { SavedWordList } from "@/lib/wordLists"

type Delta = { icon: LucideIcon; good: boolean; text: string }

function DeltaText({ icon: Icon, good, text }: Delta) {
  return <p className={`flex gap-1 text-xs ${good ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
    <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{text}
  </p>
}

function weekDelta(current: number, previous: number, format: (value: number) => string): Delta {
  if (format(Math.abs(current - previous)) === format(0)) return { icon: Minus, good: false, text: '先週と同じ' }
  const more = current > previous
  return { icon: more ? TrendingUp : TrendingDown, good: more, text: `先週より ${format(Math.abs(current - previous))}${more ? '多い' : '少ない'}` }
}

// `describe` returns null when the rounded difference is zero. Stat tiles already name the recent window in their label.
function changeDelta(change: Change, lowerIsBetter: boolean, describe: (difference: number) => string | null, namedRecent = true): Delta {
  const recent = !namedRecent ? '' : change.recentCount === 1 ? '最新の記録は、' : `直近${change.recentCount}回の平均は、`
  const previous = change.previousCount === 1 ? 'その前の記録' : `その前の${change.previousCount}回`
  const difference = change.recent - change.previous
  const text = describe(difference)
  if (!text) return { icon: Minus, good: false, text: `${recent}${previous}と同じ` }
  return { icon: difference > 0 ? TrendingUp : TrendingDown, good: difference > 0 !== lowerIsBetter, text: `${recent}${previous}より ${text}` }
}

const secondsDifference = (difference: number) => {
  const value = Math.abs(difference).toFixed(2)
  return value === '0.00' ? null : `${value} 秒${difference > 0 ? '遅い' : '速い'}`
}
const pointDifference = (difference: number) => {
  const value = Math.abs(difference).toFixed(1)
  return value === '0.0' ? null : `${difference > 0 ? '+' : '−'}${value}pt`
}

function Stat({ label, parts, delta }: { label: string; parts: [string, string][]; delta: Delta }) {
  return <div className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
    <dt className="text-[13px] text-muted-foreground">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-x-0.5">
      {parts.map(([value, unit]) => <Fragment key={unit}><span className="text-2xl font-semibold xl:text-3xl">{value}</span><span className="mr-1 text-sm text-muted-foreground">{unit}</span></Fragment>)}
    </dd>
    <dd><DeltaText {...delta} /></dd>
  </div>
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const id = useId()
  return <section aria-labelledby={id} className="flex flex-col gap-4">
    <div className="space-y-1">
      <h2 id={id} className="text-xl">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {children}
  </section>
}

function practiceHref(list: SavedWordList) { return `/play?list=${encodeURIComponent(list.id)}` }

function reasonBadge({ reason }: NextList) {
  if (reason.kind === 'new') return { icon: Sparkles, text: 'まだ練習していません' }
  if (reason.kind === 'stale') return { icon: Clock, text: `${reason.days}日間練習していません` }
  return { icon: Target, text: `直近${reason.count}回の正確率 ${reason.accuracy.toFixed(1)}%` }
}

function NextLists({ items, now }: { items: NextList[]; now: Date }) {
  if (!items.length) return <p className="rounded-xl p-4 text-sm ring-1 ring-foreground/10">どのリストも最近練習できています。</p>
  return <ul className="divide-y overflow-hidden rounded-xl ring-1 ring-foreground/10">
    {items.map(item => {
      const { icon: Icon, text } = reasonBadge(item)
      return <li key={item.list.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 p-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <p className="font-medium break-words">{item.list.name}</p>
          <p className="text-[13px] text-muted-foreground">{item.list.words.length} 単語 · {item.lastPracticed ? `最終練習 ${formatDay(item.lastPracticed, now)}` : '記録なし'}</p>
        </div>
        <Badge variant="outline" className="col-span-2 justify-self-start md:col-span-1"><Icon aria-hidden="true" />{text}</Badge>
        <Button asChild variant="outline" className="col-start-2 row-start-1 md:col-start-3">
          <Link href={practiceHref(item.list)} aria-label={`${item.list.name} を練習する`}>練習する</Link>
        </Button>
      </li>
    })}
  </ul>
}

function Metric({ title, trend, scale, format, unit, lowerIsBetter, describe }: {
  title: string
  trend: Trend
  scale: Scale | null
  format: (value: number) => string
  unit: string
  lowerIsBetter: boolean
  describe: (difference: number) => string | null
}) {
  const latest = trend.points[trend.points.length - 1]
  const withUnit = (value: number) => `${format(value)}${unit}`
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <h4 className="text-[13px] text-muted-foreground">{title}</h4>
      {latest && <p className="text-xs text-muted-foreground">最新 <span className="text-base font-semibold text-foreground">{withUnit(latest.value)}</span></p>}
    </div>
    {trend.change && <DeltaText {...changeDelta(trend.change, lowerIsBetter, describe)} />}
    {scale ? <TrendChart label={title} points={trend.points} scale={scale} format={withUnit} />
      : <p className="text-sm text-muted-foreground">この項目のある記録が2回以上になると表示します。</p>}
  </div>
}

function TrendCard({ trend, now }: { trend: ListTrend; now: Date }) {
  const id = useId()
  const { list, best } = trend
  const speed = trend.speed.points.map(point => point.value)
  const accuracy = trend.accuracy.points.map(point => point.value)
  return <article aria-labelledby={id} className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5">
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 id={id} className="font-medium break-words">{list.name}</h3>
      <p className="text-[13px] text-muted-foreground">{trend.count}回 · 最終練習 {formatDay(trend.lastPracticed, now)}</p>
    </header>
    {trend.count < 2 ? <>
      <p className="text-sm text-muted-foreground">記録が2回以上になると推移を表示します。</p>
      <Button asChild variant="outline" className="self-start"><Link href={practiceHref(list)} aria-label={`${list.name} を練習する`}><Keyboard aria-hidden="true" />練習する</Link></Button>
    </> : <>
      <Metric title="1単語あたりの秒数" trend={trend.speed} scale={speed.length > 1 ? speedScale(speed) : null} format={value => value.toFixed(2)} unit=" 秒" lowerIsBetter describe={secondsDifference} />
      <Metric title="正確率" trend={trend.accuracy} scale={accuracy.length > 1 ? accuracyScale(accuracy) : null} format={value => value.toFixed(1)} unit="%" lowerIsBetter={false} describe={pointDifference} />
      <p className="border-t pt-3 text-[13px] text-muted-foreground">
        ベスト記録：正確率 {best.accuracy === undefined ? '未記録' : `${best.accuracy}%`}・{best.time.toFixed(2)} 秒（{formatDay(new Date(best.date), now)}）
      </p>
    </>}
  </article>
}

export default function Dashboard({ lists, guest }: { lists: SavedWordList[]; guest: boolean }) {
  const [now] = useState(() => new Date())
  const summary = summarize(lists, now)
  const { accuracy } = summary
  return <div className="flex flex-col gap-9 lg:gap-12">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl lg:text-3xl">練習の状況</h1>
        <p className="text-sm text-muted-foreground">{guest ? 'このブラウザー' : 'アカウント'}に保存された記録から集計しています。</p>
      </div>
      <nav aria-label="はじめる" className="flex flex-wrap gap-3">
        <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />練習する</Link></Button>
        <Button asChild variant="outline"><Link href="/create"><Plus aria-hidden="true" />リストを作成</Link></Button>
      </nav>
    </div>
    <Section title="今週のまとめ" description={`${formatWeekday(summary.weekStart)}〜${formatWeekday(addDays(summary.weekStart, 6))}の記録です。増減は、先週の同じ曜日・時刻までの記録と比べています。`}>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="今週の練習" parts={[[String(summary.weekCount), '回']]} delta={weekDelta(summary.weekCount, summary.previousWeekCount, value => `${value}回`)} />
        <Stat label="連続練習" parts={[[String(summary.streak), '日']]} delta={summary.practicedToday
          ? { icon: Check, good: true, text: '今日も練習済み' }
          : { icon: Keyboard, good: false, text: `今日練習すると${summary.streak + 1}日目` }} />
        <Stat label={`平均正確率（直近${accuracy?.recentCount ?? 10}回）`} parts={[accuracy ? [accuracy.recent.toFixed(1), '%'] : ['—', '']]}
          delta={accuracy?.change ? changeDelta(accuracy.change, false, pointDifference, false)
            : { icon: Minus, good: false, text: accuracy ? '比べる記録がまだありません' : '正確率のある記録がありません' }} />
        <Stat label="今週の練習時間" parts={durationParts(summary.weekSeconds)} delta={weekDelta(summary.weekSeconds, summary.previousWeekSeconds, formatDuration)} />
      </dl>
    </Section>
    <Section title="次に練習するリスト" description={`まだ練習していないリスト、${STALE_DAYS}日以上練習していないリスト、直近の正確率が${LOW_ACCURACY}%未満のリストを最大3件表示します。`}>
      <NextLists items={nextLists(lists, now)} now={now} />
    </Section>
    <Section title="リスト別の推移" description="1単語あたりの秒数（低いほど速い）と正確率を、直近20回まで表示します。所要時間を単語数で割っているので、リストを編集した前後でも比べられます。">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {listTrends(lists).map(trend => <TrendCard key={trend.list.id} trend={trend} now={now} />)}
      </div>
    </Section>
  </div>
}
