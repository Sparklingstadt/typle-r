"use client"
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, ChevronDown, History, Keyboard, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TrendChart from '@/components/Dashboard/TrendChart'
import { RecordTime } from '@/components/Records/RecordRow'
import TopRecords from '@/components/Rankings/TopRecords'
import PracticeName, { usePracticeName } from '@/components/PracticeName'
import { useFormat } from '@/i18n/useFormat'
import type { PracticeDevice } from '@/core/devices'
import { speedScale } from '@/core/dashboard'
import { formatAccuracy, recordMode, type PracticeMode, type RankOrder } from '@/core/records'
import { listRanking, RANKING_TOP, rankingStats } from '@/core/rankings'
import type { SavedWordList } from '@/core/wordLists'
import { cn } from '@/lib/utils'

// Remount per list (key) so "show all" and "include other word counts" start closed for each list.
export default function RankingDetail({ list, devices, device, deviceName, order, mode = 'typing', now, onBack, onShowAllDevices }: {
  list: SavedWordList
  devices: PracticeDevice[]
  device: string | null
  deviceName: string
  order: RankOrder
  mode?: PracticeMode
  now: Date
  onBack: () => void
  onShowAllDevices: () => void
}) {
  const t = useTranslations('rankings')
  const format = useFormat()
  const [includeOthers, setIncludeOthers] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const ranking = listRanking(list, { device, order, includeOthers, mode, now })
  const { ranked, best } = ranking
  const practice = `/play?list=${encodeURIComponent(list.id)}`
  const lastPracticed = list.records.filter(record => recordMode(record) === mode).reduce((latest, record) => Math.max(latest, Date.parse(record.date)), 0)

  return <div className="flex flex-col gap-5 p-4 sm:p-6">
    <Button variant="ghost" size="sm" className="-ml-2 self-start xl:hidden" onClick={onBack}><ArrowLeft aria-hidden="true" />{t('detail.back')}</Button>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id="ranking-title" tabIndex={-1} className="text-xl font-bold outline-none [overflow-wrap:anywhere]"><PracticeName list={list} /></h2>
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground tabular-nums">
          <span>{t('detail.words', { count: list.words.length })}</span><span aria-hidden="true">·</span><span>{t('detail.records', { count: list.records.length })}</span>
          {lastPracticed > 0 && <><span aria-hidden="true">·</span><span>{t('detail.lastPracticed', { day: format.day(new Date(lastPracticed), now) })}</span></>}
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        {list.records.length > 0 && <Button variant="ghost" size="lg" className="hidden sm:inline-flex" asChild>
          <Link href={`/records?list=${encodeURIComponent(list.id)}`}>{t('detail.viewRecords')}<ArrowRight aria-hidden="true" /></Link>
        </Button>}
        <Button size="lg" className="grow sm:grow-0" asChild><Link href={practice}><Keyboard aria-hidden="true" />{t('detail.practice')}</Link></Button>
      </div>
    </div>

    {!ranked.length ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Trophy className="size-5" aria-hidden="true" /></span>
      {!device || !list.records.length ? <>
        <div className="space-y-1">
          <h3 className="font-bold">{t('detail.notPractised.title')}</h3>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">{t('detail.notPractised.description')}</p>
        </div>
        <Button variant="outline" asChild><Link href={practice}><Keyboard aria-hidden="true" />{t('detail.practice')}</Link></Button>
      </> : <>
        <div className="space-y-1">
          <h3 className="font-bold [overflow-wrap:anywhere]">{t('detail.noDeviceRecords.title', { device: deviceName })}</h3>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">{t('detail.noDeviceRecords.description', { count: list.records.length })}</p>
        </div>
        <Button variant="outline" onClick={onShowAllDevices}>{t('detail.noDeviceRecords.showAll')}</Button>
      </>}
    </div> : <>
      <Stats ranked={ranked} best={best!} list={list} now={now} mixed={ranking.fallback || includeOthers} />
      <Trend list={list} ranked={ranked} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">{t('detail.top.title')} <span className="font-normal text-muted-foreground">{t(`detail.top.${order}`)}{device ? ` · ${deviceName}` : ''}</span></h3>
          <span className="text-xs text-muted-foreground tabular-nums">{t('detail.top.shown', { shown: Math.min(showAll ? ranked.length : RANKING_TOP, ranked.length), total: ranked.length })}</span>
        </div>
        <p className="text-xs text-muted-foreground sm:hidden">{t(`orderNotes.${order}`)}</p>
        <TopRecords records={showAll ? ranked : ranked.slice(0, RANKING_TOP)} list={list} devices={devices} now={now} />
        {ranked.length > RANKING_TOP && <Button variant="ghost" size="sm" className="w-full text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? t('detail.top.showTop', { count: RANKING_TOP }) : t('detail.top.showAll', { count: ranked.length })}<ChevronDown className={cn('transition-transform motion-reduce:transition-none', showAll && 'rotate-180')} aria-hidden="true" />
        </Button>}
        {ranked.some(record => record.accuracy === undefined) && <p className="text-xs text-muted-foreground">{t('detail.top.oldAccuracy')}</p>}
      </div>

      {ranking.others.length > 0 && <OtherWordCounts ranking={ranking} includeOthers={includeOthers} onChange={setIncludeOthers} />}
    </>}
  </div>
}

function Stats({ ranked, best, list, now, mixed }: { ranked: SavedWordList['records']; best: SavedWordList['records'][number]; list: SavedWordList; now: Date; mixed: boolean }) {
  const t = useTranslations('rankings.detail.stats')
  const format = useFormat()
  const stats = rankingStats(ranked)
  const gap = stats.recentTime === null ? 0 : stats.recentTime - best.time
  return <dl className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
    <Tile term={t('best')} highlight value={<RecordTime seconds={best.time} />}
      note={t('bestNote', { accuracy: best.accuracy === undefined ? t('noAccuracy') : formatAccuracy(best.accuracy), day: format.day(new Date(best.date), now) })} />
    <Tile term={t('recentAverage', { count: stats.recentCount })} value={<RecordTime seconds={stats.recentTime ?? 0} />}
      note={gap > 0.005 ? t('gap', { value: gap.toFixed(2) }) : t('sameAsBest')} />
    <Tile term={t('averageAccuracy')} value={stats.recentAccuracy === null ? '—' : `${stats.recentAccuracy.toFixed(1)}%`} note={t('recentRuns', { count: stats.recentCount })} />
    <Tile term={t('runs')} value={t.rich('runsValue', { count: ranked.length, unit: chunks => <span className="ml-px text-[0.8em] font-normal text-muted-foreground">{chunks}</span> })}
      note={mixed ? t('allWordCounts') : t('currentWords', { count: list.words.length })} />
  </dl>
}

function Tile({ term, value, note, highlight }: { term: string; value: ReactNode; note: string; highlight?: boolean }) {
  return <div className={cn('grid min-w-0 content-start gap-0.5 rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5', highlight && 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30')}>
    <dt className="flex items-center gap-1 text-xs text-muted-foreground">{highlight && <Trophy className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />}{term}</dt>
    <dd className="text-xl font-medium tabular-nums sm:text-2xl">{value}</dd>
    <dd className="text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">{note}</dd>
  </div>
}

function Trend({ list, ranked }: { list: SavedWordList; ranked: SavedWordList['records'] }) {
  const t = useTranslations('rankings.detail.trend')
  const practiceName = usePracticeName()
  const format = useFormat()
  const { points } = rankingStats(ranked)
  return <div className="space-y-2">
    <h3 className="text-sm font-bold">{t('title')} <span className="font-normal text-muted-foreground">{t('recent', { count: points.length })}</span></h3>
    {points.length > 1
      ? <TrendChart label={t('label', { name: practiceName(list) })} points={points} scale={speedScale(points.map(point => point.value))} format={format.recordTime} />
      : <p className="rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{t('needTwo')}</p>}
  </div>
}

// Runs at another word count are not comparable by time, so they are explained rather than silently mixed in.
function OtherWordCounts({ ranking, includeOthers, onChange }: { ranking: ReturnType<typeof listRanking>; includeOthers: boolean; onChange: (value: boolean) => void }) {
  const t = useTranslations('rankings.detail.others')
  const { list, others, otherCounts, fallback } = ranking
  const detail = otherCounts.map(({ wordCount, count }) => wordCount === null ? t('old', { count }) : t('words', { words: wordCount, count })).join(t('separator'))
  return <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg border border-dashed bg-muted/40 px-3.5 py-3 text-[13px]">
    <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <p className="min-w-0 flex-1 basis-52 text-muted-foreground">
      {fallback ? t('fallback', { count: list.words.length, detail })
        : includeOthers ? t('included', { detail })
          : t.rich('excluded', { count: others.length, detail, strong: chunks => <span className="font-medium text-foreground">{chunks}</span> })}
    </p>
    {!fallback && <Button variant="outline" size="sm" className="ml-6.5 shrink-0 sm:ml-0" onClick={() => onChange(!includeOthers)}>
      {t(includeOthers ? 'exclude' : 'include')}
    </Button>}
  </div>
}
