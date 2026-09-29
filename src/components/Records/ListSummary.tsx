import Link from 'next/link'
import { Keyboard, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dashboard'
import { bestRecords, formatAccuracy } from '@/lib/records'
import type { SavedWordList } from '@/lib/wordLists'
import { RecordTime } from '@/components/Records/RecordRow'

// Shown while one list is selected: how that list is going, and the way back to practising it.
export default function ListSummary({ list, now }: { list: SavedWordList; now: Date }) {
  const best = bestRecords(list.records, 1)[0]
  const last = list.records.reduce<string | null>((latest, record) => !latest || Date.parse(record.date) > Date.parse(latest) ? record.date : latest, null)
  return <section aria-labelledby="list-summary-heading" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:p-5">
    <div className="min-w-0">
      <h2 id="list-summary-heading" className="font-bold [overflow-wrap:anywhere]">{list.name}</h2>
      <p className="text-[13px] text-muted-foreground tabular-nums">
        {list.words.length}語 · 練習 {list.records.length}回{last && ` · 最終 ${formatDay(new Date(last), now)}`}
      </p>
    </div>
    {best && <div className="min-w-0 sm:text-right">
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Trophy className="size-3 text-amber-600" aria-hidden="true" />ベスト</p>
      <p className="tabular-nums"><RecordTime seconds={best.time} className="text-lg font-bold" /><span className="ml-2 text-sm">{formatAccuracy(best.accuracy)}</span>
        <span className="ml-2 text-xs text-muted-foreground">{formatDay(new Date(best.date), now)}</span></p>
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" className="grow sm:grow-0"><Link href="/rankings">ベスト記録</Link></Button>
      <Button asChild className="grow sm:grow-0"><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />練習する</Link></Button>
    </div>
  </section>
}
