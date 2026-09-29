import { deviceLabel, type PracticeDevice } from '@/lib/devices'
import { formatDay } from '@/lib/dashboard'
import { formatAccuracy } from '@/lib/records'
import type { SavedWordList } from '@/lib/wordLists'
import { cn } from '@/lib/utils'
import { clock, RecordTime } from '@/components/Records/RecordRow'

type StoredRecord = SavedWordList['records'][number]
type Props = { records: StoredRecord[]; list: SavedWordList; devices: PracticeDevice[]; now: Date }

const OLD_ACCURACY = '正確率を記録する前の古い記録です'

export function RankBadge({ rank }: { rank: number }) {
  return <span className={cn('grid size-6 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground',
    rank === 1 && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>{rank}</span>
}

// Only the name is shown so it fits one line; the layout stays in the tooltip. Deleted devices live on in their records.
function deviceText(record: StoredRecord, devices: PracticeDevice[]) {
  if (!record.device) return { name: '—', title: '端末の記録なし', removed: false }
  return { name: record.device.name, title: deviceLabel(record.device), removed: !devices.some(device => device.id === record.device!.id) }
}

function dateText(record: StoredRecord, now: Date) {
  const day = formatDay(new Date(record.date), now)
  return { text: `${day} ${clock(record.date)}`, today: day === '今日' }
}

function WordCount({ record, list }: { record: StoredRecord; list: SavedWordList }) {
  if (record.wordCount === list.words.length) return null
  return <span className="ml-1.5 rounded border px-1 text-[11px] font-normal text-muted-foreground" title="単語数が今と違う記録">
    {record.wordCount ?? '?'}語
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
  return <table className="hidden w-full table-fixed text-sm tabular-nums sm:table" aria-label={`${list.name} の上位の記録`}>
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b">
        <th scope="col" className="w-12 py-2 pl-2 text-left font-medium">順位</th>
        <th scope="col" className="w-36 py-2 text-left font-medium">所要時間</th>
        <th scope="col" className="w-20 py-2 text-left font-medium">正確率</th>
        <th scope="col" className="w-14 py-2 text-left font-medium">ミス</th>
        <th scope="col" className="py-2 text-left font-medium">端末</th>
        <th scope="col" className="w-32 py-2 pr-2 text-right font-medium">日時</th>
      </tr>
    </thead>
    <tbody>{records.map((record, index) => {
      const device = deviceText(record, devices)
      const date = dateText(record, now)
      return <tr key={record.id ?? `${index}-${record.date}`} className={cn('border-b border-border/60 last:border-0', index === 0 && 'bg-amber-50/50 dark:bg-amber-950/20')}>
        <th scope="row" className="py-2.5 pl-2 text-left font-normal"><RankBadge rank={index + 1} /></th>
        <td className="py-2.5 whitespace-nowrap"><RecordTime seconds={record.time} className="font-medium" /><WordCount record={record} list={list} /></td>
        <td className="py-2.5" title={record.accuracy === undefined ? OLD_ACCURACY : undefined}>{formatAccuracy(record.accuracy)}</td>
        <td className="py-2.5 text-muted-foreground">{record.mistakes ?? '—'}</td>
        <td className="py-2.5 pr-3" title={device.title}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate', !record.device && 'text-muted-foreground')}>{device.name}</span>
            {device.removed && <span className="shrink-0 text-[11px] text-muted-foreground">削除済み</span>}
          </span>
        </td>
        <td className={cn('py-2.5 pr-2 text-right whitespace-nowrap text-muted-foreground', date.today && 'font-medium text-green-700 dark:text-green-400')}>{date.text}</td>
      </tr>
    })}</tbody>
  </table>
}

function RecordCards({ records, list, devices, now }: Props) {
  return <ol className="divide-y rounded-lg border sm:hidden" aria-label={`${list.name} の上位の記録`}>{records.map((record, index) => {
    const device = deviceText(record, devices)
    const date = dateText(record, now)
    return <li key={record.id ?? `${index}-${record.date}`} className={cn('grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 tabular-nums', index === 0 && 'bg-amber-50/50 dark:bg-amber-950/20')}>
      <span className="row-span-2"><span className="sr-only">{index + 1}位 </span><span aria-hidden="true"><RankBadge rank={index + 1} /></span></span>
      <span><span className="sr-only">所要時間 </span><RecordTime seconds={record.time} className="text-[15px] font-medium" /><WordCount record={record} list={list} /></span>
      <span className="text-right text-sm" title={record.accuracy === undefined ? OLD_ACCURACY : undefined}><span className="sr-only">正確率 </span>{formatAccuracy(record.accuracy)}</span>
      <span className="truncate text-xs text-muted-foreground" title={device.title}>{device.name}{device.removed && '（削除済み）'}</span>
      <span className={cn('text-right text-xs text-muted-foreground', date.today && 'font-medium text-green-700 dark:text-green-400')}>{date.text}</span>
    </li>
  })}</ol>
}
