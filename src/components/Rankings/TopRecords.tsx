import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import type { PracticeDevice } from '@/core/devices'
import { dayKind } from '@/core/dashboard'
import { formatAccuracy } from '@/core/records'
import type { SavedWordList } from '@/core/wordLists'
import { cn } from '@/lib/utils'
import { RecordTime } from '@/components/Records/RecordRow'

type StoredRecord = SavedWordList['records'][number]
type Props = { records: StoredRecord[]; list: SavedWordList; devices: PracticeDevice[]; now: Date }

export function RankBadge({ rank }: { rank: number }) {
  return <span className={cn('grid size-6 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground',
    rank === 1 && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>{rank}</span>
}

// Only the name is shown so it fits one line; the layout stays in the tooltip. Deleted devices live on in their records.
// Dates read as 今日 / 昨日 / the date, with the time.
function useCells(devices: PracticeDevice[], now: Date) {
  const t = useTranslations('rankings.top')
  const format = useFormat()
  return {
    device(record: StoredRecord) {
      if (!record.device) return { name: '—', title: format.recordDevice(), removed: false }
      return { name: record.device.name, title: format.device(record.device), removed: !devices.some(device => device.id === record.device!.id) }
    },
    date(record: StoredRecord) {
      const date = new Date(record.date)
      return { text: `${format.day(date, now)} ${format.clock(date)}`, today: dayKind(date, now) === 'today' }
    },
  }
}

function WordCount({ record, list }: { record: StoredRecord; list: SavedWordList }) {
  const t = useTranslations('rankings.top')
  if (record.wordCount === list.words.length) return null
  return <span className="ml-1.5 rounded border px-1 text-[11px] font-normal text-muted-foreground" title={t('otherWords')}>
    {record.wordCount === undefined ? t('unknownWords') : t('words', { count: record.wordCount })}
  </span>
}

// A fixed-width table from `sm` up, and one card per record on phones, so the columns never scroll sideways.
export default function TopRecords(props: Props) {
  return <>
    <RecordTable {...props} />
    <RecordCards {...props} />
  </>
}

function RecordTable({ records, list, devices, now }: Props) {
  const t = useTranslations('rankings.top')
  const cells = useCells(devices, now)
  return <table className="hidden w-full table-fixed text-sm tabular-nums sm:table" aria-label={t('label', { name: list.name })}>
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b">
        <th scope="col" className="w-12 py-2 pl-2 text-left font-medium">{t('rank')}</th>
        <th scope="col" className="w-36 py-2 text-left font-medium">{t('time')}</th>
        <th scope="col" className="w-20 py-2 text-left font-medium">{t('accuracy')}</th>
        <th scope="col" className="w-14 py-2 text-left font-medium">{t('mistakes')}</th>
        <th scope="col" className="py-2 text-left font-medium">{t('device')}</th>
        <th scope="col" className="w-32 py-2 pr-2 text-right font-medium">{t('date')}</th>
      </tr>
    </thead>
    <tbody>{records.map((record, index) => {
      const device = cells.device(record)
      const date = cells.date(record)
      return <tr key={record.id ?? `${index}-${record.date}`} className={cn('border-b border-border/60 last:border-0', index === 0 && 'bg-amber-50/50 dark:bg-amber-950/20')}>
        <th scope="row" className="py-2.5 pl-2 text-left font-normal"><RankBadge rank={index + 1} /></th>
        <td className="py-2.5 whitespace-nowrap"><RecordTime seconds={record.time} className="font-medium" /><WordCount record={record} list={list} /></td>
        <td className="py-2.5" title={record.accuracy === undefined ? t('oldAccuracy') : undefined}>{formatAccuracy(record.accuracy)}</td>
        <td className="py-2.5 text-muted-foreground">{record.mistakes ?? '—'}</td>
        <td className="py-2.5 pr-3" title={device.title}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate', !record.device && 'text-muted-foreground')}>{device.name}</span>
            {device.removed && <span className="shrink-0 text-[11px] text-muted-foreground">{t('deleted')}</span>}
          </span>
        </td>
        <td className={cn('py-2.5 pr-2 text-right whitespace-nowrap text-muted-foreground', date.today && 'font-medium text-green-700 dark:text-green-400')}>{date.text}</td>
      </tr>
    })}</tbody>
  </table>
}

function RecordCards({ records, list, devices, now }: Props) {
  const t = useTranslations('rankings.top')
  const cells = useCells(devices, now)
  return <ol className="divide-y rounded-lg border sm:hidden" aria-label={t('label', { name: list.name })}>{records.map((record, index) => {
    const device = cells.device(record)
    const date = cells.date(record)
    return <li key={record.id ?? `${index}-${record.date}`} className={cn('grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 tabular-nums', index === 0 && 'bg-amber-50/50 dark:bg-amber-950/20')}>
      <span className="row-span-2"><span className="sr-only">{t('rankNumber', { rank: index + 1 })} </span><span aria-hidden="true"><RankBadge rank={index + 1} /></span></span>
      <span><span className="sr-only">{t('time')} </span><RecordTime seconds={record.time} className="text-[15px] font-medium" /><WordCount record={record} list={list} /></span>
      <span className="text-right text-sm" title={record.accuracy === undefined ? t('oldAccuracy') : undefined}><span className="sr-only">{t('accuracy')} </span>{formatAccuracy(record.accuracy)}</span>
      <span className="truncate text-xs text-muted-foreground" title={device.title}>{device.name}{device.removed && t('deletedSuffix')}</span>
      <span className={cn('text-right text-xs text-muted-foreground', date.today && 'font-medium text-green-700 dark:text-green-400')}>{date.text}</span>
    </li>
  })}</ol>
}
