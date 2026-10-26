"use client"
import { Fragment, useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Check, Clock, Keyboard, Minus, Plus, Sparkles, Target, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import TrendChart from "@/components/Dashboard/TrendChart"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import { useFormat } from "@/i18n/useFormat"
import {
  accuracyScale, listTrends, nextLists, speedScale, summarize, addDays,
  LOW_ACCURACY, STALE_DAYS, type Change, type ListTrend, type NextList, type Scale, type Trend,
} from "@/core/dashboard"
import type { SavedWordList } from "@/core/wordLists"
import type { WorkspaceLocation } from "@/core/workspaceStore"

type Delta = { icon: LucideIcon; good: boolean; text: string }
type T = ReturnType<typeof useTranslations<'dashboard'>>

function DeltaText({ icon: Icon, good, text }: Delta) {
  return <p className={`flex gap-1 text-xs ${good ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
    <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{text}
  </p>
}

function weekDelta(t: T, current: number, previous: number, format: (value: number) => string): Delta {
  if (format(Math.abs(current - previous)) === format(0)) return { icon: Minus, good: false, text: t('week.sameAsLastWeek') }
  const more = current > previous
  const value = format(Math.abs(current - previous))
  return { icon: more ? TrendingUp : TrendingDown, good: more, text: t(more ? 'week.moreThanLastWeek' : 'week.lessThanLastWeek', { value }) }
}

// `describe` returns null when the rounded difference is zero. Stat tiles already name the recent window in their label.
function changeDelta(t: T, change: Change, lowerIsBetter: boolean, describe: (t: T, difference: number) => string | null, namedRecent = true): Delta {
  const values = {
    recent: !namedRecent ? 'none' : change.recentCount === 1 ? 'latest' : 'average',
    recentCount: change.recentCount,
    previous: change.previousCount === 1 ? 'latest' : 'average',
    previousCount: change.previousCount,
  }
  const difference = change.recent - change.previous
  const text = describe(t, difference)
  if (!text) return { icon: Minus, good: false, text: t('change.same', values) }
  return { icon: difference > 0 ? TrendingUp : TrendingDown, good: difference > 0 !== lowerIsBetter, text: t('change.different', { ...values, difference: text }) }
}

const secondsDifference = (t: T, difference: number) => {
  const value = Math.abs(difference).toFixed(2)
  return value === '0.00' ? null : t('change.seconds', { value, direction: difference > 0 ? 'up' : 'down' })
}
const pointDifference = (t: T, difference: number) => {
  const value = Math.abs(difference).toFixed(1)
  return value === '0.0' ? null : t('change.points', { value, direction: difference > 0 ? 'up' : 'down' })
}

function Stat({ label, parts, delta }: { label: string; parts: [string, string][]; delta: Delta }) {
  // Languages that put a space between a number and its unit get a little more room; a percent sign stays attached.
  const spaced = useFormat().unitSpace !== ''
  return <div className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
    <dt className="text-[13px] text-muted-foreground">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-x-0.5">
      {parts.map(([value, unit]) => <Fragment key={unit}><span className="text-2xl font-semibold xl:text-3xl">{value}</span><span className={`mr-1 text-sm text-muted-foreground${spaced && unit !== '%' ? ' ml-1' : ''}`}>{unit}</span></Fragment>)}
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

function reasonBadge(t: T, { reason }: NextList) {
  if (reason.kind === 'new') return { icon: Sparkles, text: t('next.new') }
  if (reason.kind === 'stale') return { icon: Clock, text: t('next.stale', { days: reason.days }) }
  return { icon: Target, text: t('next.lowAccuracy', { count: reason.count, accuracy: reason.accuracy.toFixed(1) }) }
}

function NextLists({ items, now }: { items: NextList[]; now: Date }) {
  const t = useTranslations('dashboard')
  const practiceName = usePracticeName()
  const format = useFormat()
  if (!items.length) return <p className="rounded-xl p-4 text-sm ring-1 ring-foreground/10">{t('next.allPractised')}</p>
  return <ul className="divide-y overflow-hidden rounded-xl ring-1 ring-foreground/10">
    {items.map(item => {
      const { icon: Icon, text } = reasonBadge(t, item)
      return <li key={item.list.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 p-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <p className="font-medium break-words"><PracticeName list={item.list} /></p>
          <p className="text-[13px] text-muted-foreground">{t('next.words', { count: item.list.words.length })} · {item.lastPracticed ? t('next.lastPracticed', { day: format.day(item.lastPracticed, now) }) : t('next.noRecords')}</p>
        </div>
        <Badge variant="outline" className="col-span-2 justify-self-start md:col-span-1"><Icon aria-hidden="true" />{text}</Badge>
        <Button asChild variant="outline" className="col-start-2 row-start-1 md:col-start-3">
          <Link href={practiceHref(item.list)} aria-label={t('next.practiceList', { name: practiceName(item.list) })}>{t('next.practice')}</Link>
        </Button>
      </li>
    })}
  </ul>
}

function Metric({ title, trend, scale, withUnit, lowerIsBetter, describe }: {
  title: string
  trend: Trend
  scale: Scale | null
  withUnit: (value: number) => string
  lowerIsBetter: boolean
  describe: (t: T, difference: number) => string | null
}) {
  const t = useTranslations('dashboard')
  const latest = trend.points[trend.points.length - 1]
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <h4 className="text-[13px] text-muted-foreground">{title}</h4>
      {latest && <p className="text-xs text-muted-foreground">{t.rich('trends.latest', { value: withUnit(latest.value), number: chunks => <span className="text-base font-semibold text-foreground">{chunks}</span> })}</p>}
    </div>
    {trend.change && <DeltaText {...changeDelta(t, trend.change, lowerIsBetter, describe)} />}
    {scale ? <TrendChart label={title} points={trend.points} scale={scale} format={withUnit} />
      : <p className="text-sm text-muted-foreground">{t('trends.noChart')}</p>}
  </div>
}

function TrendCard({ trend, now }: { trend: ListTrend; now: Date }) {
  const t = useTranslations('dashboard')
  const practiceName = usePracticeName()
  const format = useFormat()
  const id = useId()
  const { list, best } = trend
  const speed = trend.speed.points.map(point => point.value)
  const accuracy = trend.accuracy.points.map(point => point.value)
  return <article aria-labelledby={id} className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5">
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 id={id} className="font-medium break-words"><PracticeName list={list} /></h3>
      <p className="text-[13px] text-muted-foreground">{t('trends.summary', { count: trend.count, day: format.day(trend.lastPracticed, now) })}</p>
    </header>
    {trend.count < 2 ? <>
      <p className="text-sm text-muted-foreground">{t('trends.needTwo')}</p>
      <Button asChild variant="outline" className="self-start"><Link href={practiceHref(list)} aria-label={t('trends.practiceList', { name: practiceName(list) })}><Keyboard aria-hidden="true" />{t('trends.practice')}</Link></Button>
    </> : <>
      <Metric title={t('trends.speed')} trend={trend.speed} scale={speed.length > 1 ? speedScale(speed) : null} withUnit={value => t('trends.seconds', { value: value.toFixed(2) })} lowerIsBetter describe={secondsDifference} />
      <Metric title={t('trends.accuracy')} trend={trend.accuracy} scale={accuracy.length > 1 ? accuracyScale(accuracy) : null} withUnit={value => t('trends.percent', { value: value.toFixed(1) })} lowerIsBetter={false} describe={pointDifference} />
      <p className="border-t pt-3 text-[13px] text-muted-foreground">
        {t('trends.best', { accuracy: best.accuracy === undefined ? t('trends.notRecorded') : `${best.accuracy}%`, time: best.time.toFixed(2), day: format.day(new Date(best.date), now) })}
      </p>
    </>}
  </article>
}

export default function Dashboard({ lists, storage }: { lists: SavedWordList[]; storage?: WorkspaceLocation }) {
  const t = useTranslations('dashboard')
  const format = useFormat()
  const [now] = useState(() => new Date())
  const summary = summarize(lists, now)
  const { accuracy } = summary
  return <div className="flex flex-col gap-9 lg:gap-12">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl lg:text-3xl">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t(storage === 'browser' ? 'sourceGuest' : 'sourceAccount')}</p>
      </div>
      <nav aria-label={t('start')} className="flex flex-wrap gap-3">
        <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
        <Button asChild variant="outline"><Link href="/packs/create"><Plus aria-hidden="true" />{t('create')}</Link></Button>
      </nav>
    </div>
    <Section title={t('week.title')} description={t('week.description', { start: format.dateWithWeekday(summary.weekStart, now), end: format.dateWithWeekday(addDays(summary.weekStart, 6), now) })}>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={t('week.count')} parts={[[String(summary.weekCount), t('week.countUnit', { count: summary.weekCount })]]}
          delta={weekDelta(t, summary.weekCount, summary.previousWeekCount, value => t('week.times', { count: value }))} />
        <Stat label={t('week.streak')} parts={[[String(summary.streak), t('week.streakUnit', { count: summary.streak })]]} delta={summary.practicedToday
          ? { icon: Check, good: true, text: t('week.practisedToday') }
          : { icon: Keyboard, good: false, text: t('week.streakNext', { day: summary.streak + 1 }) }} />
        <Stat label={t('week.accuracy', { count: accuracy?.recentCount ?? 10 })} parts={[accuracy ? [accuracy.recent.toFixed(1), '%'] : ['—', '']]}
          delta={accuracy?.change ? changeDelta(t, accuracy.change, false, pointDifference, false)
            : { icon: Minus, good: false, text: t(accuracy ? 'week.noComparison' : 'week.noAccuracy') }} />
        <Stat label={t('week.time')} parts={format.durationParts(summary.weekSeconds)} delta={weekDelta(t, summary.weekSeconds, summary.previousWeekSeconds, format.duration)} />
      </dl>
    </Section>
    <Section title={t('next.title')} description={t('next.description', { days: STALE_DAYS, accuracy: LOW_ACCURACY })}>
      <NextLists items={nextLists(lists, now)} now={now} />
    </Section>
    <Section title={t('trends.title')} description={t('trends.description')}>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {listTrends(lists).map(trend => <TrendCard key={trend.list.id} trend={trend} now={now} />)}
      </div>
    </Section>
  </div>
}
