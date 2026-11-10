"use client"
import { useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Keyboard, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import ContinueCard from "@/components/Dashboard/ContinueCard"
import NextLists from "@/components/Dashboard/NextLists"
import TrendCard from "@/components/Dashboard/TrendCard"
import WeekStats from "@/components/Dashboard/WeekStats"
import { useFormat } from "@/i18n/useFormat"
import { continueList, listTrends, nextLists, summarize, addDays, LOW_ACCURACY, STALE_DAYS } from "@/core/dashboard"
import type { SavedWordList } from "@/core/wordLists"
import type { WorkspaceLocation } from "@/core/workspaceStore"

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

export default function Dashboard({ lists, storage }: { lists: SavedWordList[]; storage?: WorkspaceLocation }) {
  const t = useTranslations('dashboard')
  const format = useFormat()
  const [now] = useState(() => new Date())
  const summary = summarize(lists, now)
  const next = continueList(lists)
  return <div className="flex flex-col gap-9 lg:gap-12">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl lg:text-3xl">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t(storage === 'browser' ? 'sourceGuest' : 'sourceAccount')}</p>
      </div>
      <nav aria-label={t('start')} className="flex flex-wrap gap-3">
        {/* With a list to go on with, its card holds the practice button. */}
        {!next && <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>}
        <Button asChild variant="outline"><Link href="/create"><Plus aria-hidden="true" />{t('create')}</Link></Button>
      </nav>
    </div>
    {next && <ContinueCard item={next} now={now} />}
    <Section title={t('week.title')} description={t('week.description', { start: format.dateWithWeekday(summary.weekStart, now), end: format.dateWithWeekday(addDays(summary.weekStart, 6), now) })}>
      <WeekStats summary={summary} />
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
