"use client"
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, Brain, CircleCheck, Keyboard, PenLine, RotateCcw, Share2, TrendingDown, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorAlert } from '@/components/ui/alert'
import Kbd from '@/components/Practice/Kbd'
import type { PracticeDevice } from '@/core/devices'
import { bestRecords, recordsOfMode, type PracticeMode, type PracticeRecord } from '@/core/records'
import { sharedName, toSharedQuery, xIntentUrl } from '@/core/sharedResult'
import type { SavedWordList } from '@/core/wordLists'
import { cn } from '@/lib/utils'
import { useFormat } from '@/i18n/useFormat'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'
type Comparison = { rank: number } & ({ kind: 'firstAtCount' | 'firstForList' } | { kind: 'best'; difference: number } | { kind: 'behind'; previous: SavedWordList['records'][number] })

// Ranks use the same order as the best records (accuracy first, then time), so only rank 1 is shown as an improvement.
// Like ベスト記録, only runs at this word count are compared: a run from before the list was edited is a different task.
// Only runs of the practised mode are compared, so a recall or handwriting run is never measured against normal runs.
function comparison(record: PracticeRecord | null, allRecords: SavedWordList['records'], wordCount: number, saveState: SaveState, mode: PracticeMode): Comparison {
  const records = recordsOfMode(allRecords, mode)
  const ranked = bestRecords(records.filter(item => item.wordCount === wordCount), Infinity)
  const rank = record && saveState === 'saved' ? ranked.findIndex(item => item.id === record.id) + 1 : 0
  const previous = ranked.find(item => item.id !== record?.id)
  if (!previous) return { rank, kind: records.some(item => item.id !== record?.id) ? 'firstAtCount' : 'firstForList' }
  if (rank === 1 && record) return { rank, kind: 'best', difference: record.time - previous.time }
  return { rank, kind: 'behind', previous }
}

export default function PracticeResult({ listName, wordCount, result, correct, speed, device, record, records, mode = 'normal', saveState, onRestart, onRetry, onChooseList }: {
  listName: string
  wordCount: number
  result: { time: number; mistakes: number; accuracy: number }
  correct: number
  speed: number | null
  device?: PracticeDevice
  record: PracticeRecord | null
  records: SavedWordList['records']
  mode?: PracticeMode
  saveState: SaveState
  onRestart: () => void
  onRetry: () => void
  onChooseList: () => void
}) {
  const again = useRef<HTMLButtonElement>(null)
  useEffect(() => { again.current?.focus({ preventScroll: true }) }, [])
  const t = useTranslations('practice.result')
  const practice = useTranslations('practice')
  const recall = useTranslations('practice.recall')
  const writing = mode === 'writing'
  const format = useFormat()
  const compared = comparison(record, records, wordCount, saveState, mode)
  const { rank } = compared
  const best = compared.kind === 'best'
  const faster = compared.kind === 'best' && compared.difference < 0
  const note = compared.kind === 'behind'
    ? compared.previous.accuracy === undefined ? t('behindNoAccuracy', { time: compared.previous.time.toFixed(2) })
      : t('behind', { time: compared.previous.time.toFixed(2), accuracy: compared.previous.accuracy })
    : compared.kind === 'best' ? (compared.difference < 0 ? t('faster', { seconds: (-compared.difference).toFixed(2) }) : t('bestByAccuracy'))
    : compared.kind === 'firstAtCount' ? t('firstAtCount', { count: wordCount }) : t('firstForList')
  const tiles = [
    { term: t('time'), value: result.time.toFixed(2), unit: t('seconds'), note, good: best, icon: faster },
    { term: t('accuracy'), value: String(result.accuracy), unit: '%', note: t(writing ? 'mistakesWords' : 'mistakes', { count: result.mistakes }) },
    { term: t('speed'), value: speed === null ? '—' : String(speed), unit: t(writing ? 'wordSpeedUnit' : 'speedUnit'), note: t(writing ? 'correctWords' : 'correct', { count: correct }) },
    { term: t('words'), value: String(wordCount), unit: t('wordUnit', { count: wordCount }), note: format.device(device), device: true },
  ]
  // The result screen only renders in the browser, after a run, so the page's own origin is at hand.
  const shared = toSharedQuery({ name: listName, time: result.time, accuracy: result.accuracy, speed, words: wordCount, mode })
  const shareText = `${t('shareText', { name: sharedName(listName), time: result.time.toFixed(2), accuracy: result.accuracy })} #Typle`
  const shareHref = typeof window === 'undefined' ? undefined : xIntentUrl(shareText, `${window.location.origin}/result?${shared}`)
  return <section aria-label={t('label')} className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-5 sm:gap-5 sm:px-6 sm:pt-7 sm:pb-6">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-[22px] font-bold sm:text-[26px]">{t('title')}</h2>
      {mode === 'writing' && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium"><PenLine className="size-3.5" aria-hidden="true" />{practice('modeWriting')}</span>}
      {mode === 'recall' && <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-[13px] font-bold text-primary"><Brain className="size-3.5" aria-hidden="true" />{recall('resultHeading')}</span>}
      {best && <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-100 px-2.5 text-[13px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300"><Trophy className="size-3.5" aria-hidden="true" />{t('newBest')}</span>}
    </div>
    <p className="sr-only">{t('completed', { name: listName })}</p>
    <dl className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {tiles.map(tile => <div key={tile.term} className="grid min-w-0 content-start gap-0.5 rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5">
        <dt className="text-xs text-muted-foreground">{tile.term}</dt>
        <dd className="text-2xl font-medium tabular-nums sm:text-[28px]">{tile.value}<span className="ml-0.5 text-sm font-normal text-muted-foreground">{tile.unit}</span></dd>
        <dd className={cn('flex min-w-0 items-center gap-1 text-xs text-muted-foreground [overflow-wrap:anywhere]', tile.good && 'font-medium text-green-700 dark:text-green-400')}>
          {tile.icon && <TrendingDown className="size-3 shrink-0" aria-hidden="true" />}
          {tile.device && <Keyboard className="size-3 shrink-0" aria-hidden="true" />}
          <span className="min-w-0">{tile.note}</span>
        </dd>
      </div>)}
    </dl>
    {saveState === 'failed'
      ? <ErrorAlert action={<Button variant="outline" size="lg" onClick={onRetry}>{t('retry')}</Button>}>{t('saveFailed')}</ErrorAlert>
      : <p role="status" className={cn('flex items-center gap-2 text-[13px]', saveState === 'saved' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
        {saveState === 'saved' && <CircleCheck className="size-3.5" aria-hidden="true" />}
        {saveState === 'saved' ? t('saved', { rank }) : t('saving')}
      </p>}
    <div className="flex flex-wrap gap-2">
      <Button ref={again} className="grow sm:grow-0" onClick={onRestart} aria-keyshortcuts="Enter"><RotateCcw aria-hidden="true" />{t('again')}<Kbd>Enter</Kbd></Button>
      <Button variant="outline" className="grow sm:grow-0" onClick={onChooseList}>{t('chooseList')}</Button>
      <Button variant="ghost" asChild><Link href="/records">{t('viewRecords')}<ArrowRight aria-hidden="true" /></Link></Button>
      {shareHref && <Button variant="ghost" asChild><a href={shareHref} target="_blank" rel="noopener noreferrer"><Share2 aria-hidden="true" />{t('shareOnX')}</a></Button>}
    </div>
  </section>
}
