import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { deviceLabel } from '@/lib/devices'
import { bestRecords } from '@/lib/records'
import type { SavedWordList } from '@/lib/wordLists'

export default function BestRecordsTable({ records, label, showDate = false }: {
  records: SavedWordList['records']
  label: string
  showDate?: boolean
}) {
  const best = bestRecords(records)
  return <Table aria-label={label}>
    <TableHeader><TableRow>
      {['順位', '所要時間', '正確率', '単語数', '端末', ...(showDate ? ['日時'] : [])].map(title =>
        <TableHead key={title} scope="col">{title}</TableHead>)}
    </TableRow></TableHeader>
    <TableBody>
      {best.length ? best.map((record, index) => <TableRow key={record.id ?? index}>
        <TableHead scope="row">{index + 1}</TableHead>
        <TableCell>{record.time.toFixed(2)} 秒</TableCell>
        <TableCell>{record.accuracy === undefined ? '未記録' : `${record.accuracy}%`}</TableCell>
        <TableCell>{record.wordCount ?? '—'}</TableCell>
        <TableCell className="whitespace-normal break-words">{deviceLabel(record.device)}</TableCell>
        {showDate && <TableCell>{new Date(record.date).toLocaleString('ja-JP')}</TableCell>}
      </TableRow>) : <TableRow>
        <TableCell colSpan={showDate ? 6 : 5} className="py-6 text-center text-muted-foreground">まだ記録がありません。</TableCell>
      </TableRow>}
    </TableBody>
  </Table>
}
