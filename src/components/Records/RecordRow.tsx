import { useTranslations } from 'next-intl'
import { PenLine, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/i18n/useFormat'
import { LOW_ACCURACY } from '@/core/dashboard'
import { usePracticeName } from '@/components/PracticeName'
import { levelName } from '@/core/listOverview'
import { formatAccuracy, secondsPerWord, type RecordRow as Row } from '@/core/records'
import { cn } from '@/lib/utils'

// Shared by the column labels and the rows so the numbers line up under their headings.
export const recordColumns = 'sm:grid-cols-[3.25rem_minmax(0,1fr)_7rem_4.75rem_5.25rem_3rem_2.5rem] sm:gap-x-4'

export function BestBadge() {
  const t = useTranslations('records.row')
  return <span title={t('bestTitle')}
    className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
    <Trophy className="size-3" aria-hidden="true" />{t('best')}
  </span>
}

export function RecordTime({ seconds, className }: { seconds: number; className?: string }) {
  const t = useTranslations('records.row')
  const format = useFormat()
  const space = format.unitSpace
  return <span className={cn('tabular-nums', className)} title={t('seconds', { value: seconds.toFixed(2) })}>
    {format.recordTimeParts(seconds).map(([value, unit], index) => <span key={unit}>{index > 0 && space}{value}{space}<span className="ml-px text-[0.8em] font-normal text-muted-foreground">{unit}</span></span>)}
  </span>
}

// With one list selected, every row belongs to it, so the device becomes the row's title instead of the repeated list name.
// With a pack chosen (`inPack`) the pack name is left out of the row's name, since every row is in that pack.
export default function RecordRow({ row, showList, inPack = false, disabled, onDelete }: { row: Row; showList: boolean; inPack?: boolean; disabled: boolean; onDelete: () => void }) {
  const t = useTranslations('records.row')
  const records = useTranslations('records')
  const nameOf = usePracticeName()
  const format = useFormat()
  const { list, record, best } = row
  const perWord = secondsPerWord(record)
  const low = record.accuracy !== undefined && record.accuracy < LOW_ACCURACY
  const time = format.clock(new Date(record.date))
  const device = format.recordDevice(record.device)
  const listName = inPack ? levelName(list) : nameOf(list)
  const title = showList ? listName : device
  const date = format.numericDate(new Date(record.date))
  return <li data-record-key={row.key}
    className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:gap-y-0 sm:px-5', recordColumns)}>
    <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">{time}</span>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className={cn('truncate font-medium', !showList && !record.device && 'text-muted-foreground')} title={title}>{title}</h3>
        {row.mode === 'writing' && <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium"><PenLine className="size-3" aria-hidden="true" />{records('modeWriting')}</span>}
        {best && <BestBadge />}
      </div>
      <p className="truncate text-[13px] text-muted-foreground">
        <span className="tabular-nums sm:hidden">{time} · </span>
        {record.wordCount !== undefined && <span className="tabular-nums">{t('words', { count: record.wordCount })}{showList && ' · '}</span>}
        {showList && device}
      </p>
    </div>
    <p className="col-start-1 row-start-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm tabular-nums sm:contents">
      <span className="sm:text-right"><span className="sr-only">{t('duration')} </span><RecordTime seconds={record.time} className="text-base font-bold sm:text-[15px]" /></span>
      <span className={cn('sm:text-right', low && 'font-medium text-amber-700 dark:text-amber-400')} title={low ? t('lowAccuracy', { limit: LOW_ACCURACY }) : undefined}>
        <span className="sr-only">{t('accuracy')} </span>{formatAccuracy(record.accuracy)}
      </span>
      <span className="hidden sm:inline sm:text-right">
        <span className="sr-only">{t('perWord')} </span>{perWord === null ? '—' : <>{perWord.toFixed(2)}{format.unitSpace}<span className="ml-px text-[0.8em] text-muted-foreground">{t('perWordUnit')}</span></>}
      </span>
      <span className="text-muted-foreground sm:text-right sm:text-foreground">
        <span className="sm:sr-only">{t('mistakes')} </span>{record.mistakes ?? '—'}
      </span>
    </p>
    <div className="col-start-2 row-span-2 row-start-1 -mr-2 sm:col-start-7 sm:row-span-1 sm:mr-0 sm:justify-self-end">
      <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
        disabled={disabled} data-delete-record aria-label={t('deleteLabel', { name: nameOf(list), date, time })} title={t('delete')} onClick={onDelete}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  </li>
}
