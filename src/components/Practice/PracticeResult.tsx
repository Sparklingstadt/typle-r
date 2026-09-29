"use client"
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { ArrowRight, CircleAlert, CircleCheck, Keyboard, RotateCcw, TrendingDown, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Kbd from '@/components/Practice/Kbd'
import { deviceLabel, type PracticeDevice } from '@/lib/devices'
import { bestRecords, type PracticeRecord } from '@/lib/records'
import type { SavedWordList } from '@/lib/wordLists'
import { cn } from '@/lib/utils'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

// Ranks use the same order as the best records (accuracy first, then time), so only rank 1 is shown as an improvement.
function comparison(record: PracticeRecord | null, records: SavedWordList['records'], saveState: SaveState) {
  const ranked = bestRecords(records, Infinity)
  const rank = record && saveState === 'saved' ? ranked.findIndex(item => item.id === record.id) + 1 : 0
  const previous = ranked.find(item => item.id !== record?.id)
  if (!previous) return { rank, note: 'このリストの最初の記録', improved: false, best: false }
  if (rank === 1 && record) {
    const difference = record.time - previous.time
    return { rank, best: true, improved: true, note: difference < 0 ? `ベスト比 −${(-difference).toFixed(2)} 秒` : '正確率でベストを更新' }
  }
  return { rank, best: false, improved: false, note: `ベストは ${previous.time.toFixed(2)} 秒・${previous.accuracy === undefined ? '正確率未記録' : `${previous.accuracy}%`}` }
}

export default function PracticeResult({ listName, wordCount, result, correct, speed, device, record, records, saveState, onRestart, onRetry, onChooseList }: {
  listName: string
  wordCount: number
  result: { time: number; mistakes: number; accuracy: number }
  correct: number
  speed: number | null
  device?: PracticeDevice
  record: PracticeRecord | null
  records: SavedWordList['records']
  saveState: SaveState
  onRestart: () => void
  onRetry: () => void
  onChooseList: () => void
}) {
  const again = useRef<HTMLButtonElement>(null)
  useEffect(() => { again.current?.focus({ preventScroll: true }) }, [])
  const { rank, note, improved, best } = comparison(record, records, saveState)
  const tiles = [
    { term: '所要時間', value: result.time.toFixed(2), unit: '秒', note, good: improved, icon: improved && note.startsWith('ベスト比') },
    { term: '正確率', value: String(result.accuracy), unit: '%', note: `ミス ${result.mistakes} 文字` },
    { term: '速度', value: speed === null ? '—' : String(speed), unit: '打/分', note: `${correct} 文字` },
    { term: '単語', value: String(wordCount), unit: '語', note: deviceLabel(device), device: true },
  ]
  return <section aria-label="練習結果" className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-5 sm:gap-5 sm:px-6 sm:pt-7 sm:pb-6">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-[22px] font-bold sm:text-[26px]">おつかれさまでした！</h2>
      {best && <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-100 px-2.5 text-[13px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300"><Trophy className="size-3.5" aria-hidden="true" />自己ベスト更新</span>}
    </div>
    <p className="sr-only">練習完了：{listName}</p>
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
      ? <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
        <CircleAlert aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 flex-1 basis-56">記録を保存できませんでした。結果はこの画面に残っています。通信状態を確認して再試行してください。</span>
          <Button variant="outline" size="lg" onClick={onRetry}>記録の保存を再試行</Button>
        </AlertDescription>
      </Alert>
      : <p role="status" className={cn('flex items-center gap-2 text-[13px]', saveState === 'saved' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
        {saveState === 'saved' && <CircleCheck className="size-3.5" aria-hidden="true" />}
        {saveState === 'saved' ? `練習記録を保存しました。このリストの ${rank} 位です。` : '記録を保存しています…'}
      </p>}
    <div className="flex flex-wrap gap-2">
      <Button ref={again} className="grow sm:grow-0" onClick={onRestart} aria-keyshortcuts="Enter"><RotateCcw aria-hidden="true" />もう一度<Kbd>Enter</Kbd></Button>
      <Button variant="outline" className="grow sm:grow-0" onClick={onChooseList}>別のリストを選ぶ</Button>
      <Button variant="ghost" asChild><Link href="/records">記録を見る<ArrowRight aria-hidden="true" /></Link></Button>
    </div>
  </section>
}
