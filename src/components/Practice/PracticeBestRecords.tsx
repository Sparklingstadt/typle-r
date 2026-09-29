import { cn } from '@/lib/utils'
import { deviceLabel } from '@/lib/devices'
import { bestRecords } from '@/lib/records'
import type { SavedWordList } from '@/lib/wordLists'

export default function PracticeBestRecords({ records, highlightId }: { records: SavedWordList['records']; highlightId?: string }) {
  const best = bestRecords(records)
  return <table aria-label="ベスト記録 上位5件" className="w-full text-sm tabular-nums">
    <thead className="sr-only"><tr><th scope="col">順位</th><th scope="col">所要時間</th><th scope="col">正確率</th><th scope="col">端末</th></tr></thead>
    <tbody>
      {best.length ? best.map((record, index) => {
        const current = record.id !== undefined && record.id === highlightId
        return <tr key={record.id ?? index} className={cn('border-b border-border/60 last:border-0', current && 'bg-green-50 dark:bg-green-950/50')}>
          <th scope="row" className="py-2 pr-2 pl-2 text-left font-normal">
            <span className={cn('grid size-[22px] place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground', index === 0 && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>{index + 1}</span>
          </th>
          <td className="py-2 pr-3 font-medium whitespace-nowrap">{record.time.toFixed(2)} 秒</td>
          <td className="py-2 pr-3 whitespace-nowrap">{record.accuracy === undefined ? '未記録' : `${record.accuracy}%`}</td>
          <td className="w-full max-w-0 py-2 pr-2">
            <span className="flex items-center gap-2">
              <span className="truncate text-xs text-muted-foreground">{deviceLabel(record.device)}</span>
              {current && <span className="ml-auto shrink-0 text-[10px] font-bold tracking-wider text-green-700 dark:text-green-400"><span aria-hidden="true">NEW</span><span className="sr-only">今回の記録</span></span>}
            </span>
          </td>
        </tr>
      }) : <tr><td colSpan={4} className="px-2 py-3 text-muted-foreground">まだ記録がありません。最後まで打つと、ここに上位5件が表示されます。</td></tr>}
    </tbody>
  </table>
}
