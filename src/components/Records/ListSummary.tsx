import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Keyboard, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/i18n/useFormat'
import { formatAccuracy, listBest, PRACTICE_MODES } from '@/core/records'
import type { SavedWordList } from '@/core/wordLists'
import PracticeName from '@/components/PracticeName'
import { RecordTime } from '@/components/Records/RecordRow'

// Shown while one list is selected: how that list is going, and the way back to practising it. Modes are never compared,
// so the best is shown for each mode the list has records of.
export default function ListSummary({ list, now }: { list: SavedWordList; now: Date }) {
  const t = useTranslations('records.summary')
  const modes = useTranslations('rankings.mode')
  const format = useFormat()
  const bests = PRACTICE_MODES.flatMap(mode => {
    const best = listBest(list, mode)
    return best ? [{ mode, best }] : []
  })
  const last = list.records.reduce<string | null>((latest, record) => !latest || Date.parse(record.date) > Date.parse(latest) ? record.date : latest, null)
  return <section aria-labelledby="list-summary-heading" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:p-5">
    <div className="min-w-0">
      <h2 id="list-summary-heading" className="font-bold [overflow-wrap:anywhere]"><PracticeName list={list} /></h2>
      <p className="text-[13px] text-muted-foreground tabular-nums">
        {t('words', { count: list.words.length })} · {t('runs', { count: list.records.length })}{last && ` · ${t('last', { day: format.day(new Date(last), now) })}`}
      </p>
    </div>
    {bests.length > 0 && <div className="grid min-w-0 gap-2 sm:text-right">
      {bests.map(({ mode, best }) => <div key={mode} data-best-mode={mode}>
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Trophy className="size-3 text-amber-600" aria-hidden="true" />{t('best', { mode: modes(mode) })}</p>
        <p className="tabular-nums"><RecordTime seconds={best.time} className="text-lg font-bold" /><span className="ml-2 text-sm">{formatAccuracy(best.accuracy)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{format.day(new Date(best.date), now)}</span></p>
      </div>)}
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" className="grow sm:grow-0"><Link href={`/rankings?list=${encodeURIComponent(list.id)}`}>{t('rankings')}</Link></Button>
      <Button asChild className="grow sm:grow-0"><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
    </div>
  </section>
}
