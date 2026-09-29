"use client"
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, History, Keyboard, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TrendChart from '@/components/Dashboard/TrendChart'
import { RecordTime } from '@/components/Records/RecordRow'
import TopRecords from '@/components/Rankings/TopRecords'
import type { PracticeDevice } from '@/lib/devices'
import { formatDay, speedScale } from '@/lib/dashboard'
import { formatAccuracy, formatRecordTime, type RankOrder } from '@/lib/records'
import { listRanking, RANKING_TOP, rankingStats } from '@/lib/rankings'
import type { SavedWordList } from '@/lib/wordLists'
import { cn } from '@/lib/utils'

export const ORDER_NOTES: Record<RankOrder, string> = {
  accuracy: '正確率が高い順。同じ正確率なら速い順',
  speed: '速い順。同じ時間なら正確率が高い順',
}

// Remount per list (key) so "show all" and "include other word counts" start closed for each list.
export default function RankingDetail({ list, devices, device, deviceName, order, now, onBack, onShowAllDevices }: {
  list: SavedWordList
  devices: PracticeDevice[]
  device: string | null
  deviceName: string
  order: RankOrder
  now: Date
  onBack: () => void
  onShowAllDevices: () => void
}) {
  const [includeOthers, setIncludeOthers] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const ranking = listRanking(list, { device, order, includeOthers, now })
  const { ranked, best } = ranking
  const practice = `/play?list=${encodeURIComponent(list.id)}`
  const lastPracticed = list.records.reduce((latest, record) => Math.max(latest, Date.parse(record.date)), 0)

  return <div className="flex flex-col gap-5 p-4 sm:p-6">
    <Button variant="ghost" size="sm" className="-ml-2 self-start xl:hidden" onClick={onBack}><ArrowLeft aria-hidden="true" />リスト一覧</Button>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id="ranking-title" tabIndex={-1} className="text-xl font-bold outline-none [overflow-wrap:anywhere]">{list.name}</h2>
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground tabular-nums">
          <span>{list.words.length}語</span><span aria-hidden="true">·</span><span>記録 {list.records.length}回</span>
          {lastPracticed > 0 && <><span aria-hidden="true">·</span><span>最終練習 {formatDay(new Date(lastPracticed), now)}</span></>}
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        {list.records.length > 0 && <Button variant="ghost" size="lg" className="hidden sm:inline-flex" asChild>
          <Link href={`/records?list=${encodeURIComponent(list.id)}`}>記録を見る<ArrowRight aria-hidden="true" /></Link>
        </Button>}
        <Button size="lg" className="grow sm:grow-0" asChild><Link href={practice}><Keyboard aria-hidden="true" />このリストを練習</Link></Button>
      </div>
    </div>

    {!ranked.length ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Trophy className="size-5" aria-hidden="true" /></span>
      {!device || !list.records.length ? <>
        <div className="space-y-1">
          <h3 className="font-bold">まだ練習していません</h3>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">最後まで打つと、このリストの自己ベストと上位の記録がここに並びます。</p>
        </div>
        <Button variant="outline" asChild><Link href={practice}><Keyboard aria-hidden="true" />このリストを練習</Link></Button>
      </> : <>
        <div className="space-y-1">
          <h3 className="font-bold [overflow-wrap:anywhere]">「{deviceName}」で練習した記録はありません</h3>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">このリストには、ほかの端末の記録が {list.records.length}件あります。</p>
        </div>
        <Button variant="outline" onClick={onShowAllDevices}>すべての端末の記録を表示</Button>
      </>}
    </div> : <>
      <Stats ranked={ranked} best={best!} list={list} now={now} mixed={ranking.fallback || includeOthers} />
      <Trend list={list} ranked={ranked} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">上位の記録 <span className="font-normal text-muted-foreground">{order === 'accuracy' ? '正確率を優先' : '速さを優先'}{device ? ` · ${deviceName}` : ''}</span></h3>
          <span className="text-xs text-muted-foreground tabular-nums">{Math.min(showAll ? ranked.length : RANKING_TOP, ranked.length)} / {ranked.length}件</span>
        </div>
        <p className="text-xs text-muted-foreground sm:hidden">{ORDER_NOTES[order]}</p>
        <TopRecords records={showAll ? ranked : ranked.slice(0, RANKING_TOP)} list={list} devices={devices} now={now} />
        {ranked.length > RANKING_TOP && <Button variant="ghost" size="sm" className="w-full text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? `上位${RANKING_TOP}件だけ表示` : `すべて表示（${ranked.length}件）`}<ChevronDown className={cn('transition-transform motion-reduce:transition-none', showAll && 'rotate-180')} aria-hidden="true" />
        </Button>}
        {ranked.some(record => record.accuracy === undefined) && <p className="text-xs text-muted-foreground">正確率が「—」の記録は、正確率を記録する前の古い記録です。正確率を優先するときは最後に並びます。</p>}
      </div>

      {ranking.others.length > 0 && <OtherWordCounts ranking={ranking} includeOthers={includeOthers} onChange={setIncludeOthers} />}
    </>}
  </div>
}

function Stats({ ranked, best, list, now, mixed }: { ranked: SavedWordList['records']; best: SavedWordList['records'][number]; list: SavedWordList; now: Date; mixed: boolean }) {
  const stats = rankingStats(ranked)
  const gap = stats.recentTime === null ? 0 : stats.recentTime - best.time
  return <dl className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
    <Tile term="自己ベスト" highlight value={<RecordTime seconds={best.time} />}
      note={`${best.accuracy === undefined ? '正確率なし' : formatAccuracy(best.accuracy)} · ${formatDay(new Date(best.date), now)}`} />
    <Tile term={`直近${stats.recentCount}回の平均`} value={<RecordTime seconds={stats.recentTime ?? 0} />}
      note={gap > 0.005 ? `ベストとの差 +${gap.toFixed(2)}秒` : 'ベストと同じ'} />
    <Tile term="平均正確率" value={stats.recentAccuracy === null ? '—' : `${stats.recentAccuracy.toFixed(1)}%`} note={`直近${stats.recentCount}回`} />
    <Tile term="練習回数" value={<>{ranked.length}<span className="ml-px text-[0.8em] font-normal text-muted-foreground">回</span></>}
      note={mixed ? 'すべての単語数' : `今の${list.words.length}語で練習`} />
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
  const { points } = rankingStats(ranked)
  return <div className="space-y-2">
    <h3 className="text-sm font-bold">所要時間の推移 <span className="font-normal text-muted-foreground">直近{points.length}回</span></h3>
    {points.length > 1
      ? <TrendChart label={`${list.name} の所要時間の推移`} points={points} scale={speedScale(points.map(point => point.value))} format={formatRecordTime} />
      : <p className="rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">2回以上練習すると推移を表示します。</p>}
  </div>
}

// Runs at another word count are not comparable by time, so they are explained rather than silently mixed in.
function OtherWordCounts({ ranking, includeOthers, onChange }: { ranking: ReturnType<typeof listRanking>; includeOthers: boolean; onChange: (value: boolean) => void }) {
  const { list, others, otherCounts, fallback } = ranking
  const detail = otherCounts.map(({ wordCount, count }) => wordCount === null ? `単語数の記録がない古い記録 ${count}件` : `${wordCount}語の記録 ${count}件`).join('、')
  return <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg border border-dashed bg-muted/40 px-3.5 py-3 text-[13px]">
    <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <p className="min-w-0 flex-1 basis-52 text-muted-foreground">
      {fallback ? <>今の{list.words.length}語で練習した記録がないため、単語数が違う記録（{detail}）で順位を付けています。</>
        : includeOthers ? <>単語数が今と違う記録（{detail}）も含めています。単語数が違うと所要時間は単純に比べられません。</>
          : <><span className="font-medium text-foreground">単語数が今と違う{others.length}件は順位に含めていません。</span>リストを編集する前の記録などです（{detail}）。</>}
    </p>
    {!fallback && <Button variant="outline" size="sm" className="ml-6.5 shrink-0 sm:ml-0" onClick={() => onChange(!includeOthers)}>
      {includeOthers ? '含めない' : '含めて表示'}
    </Button>}
  </div>
}
