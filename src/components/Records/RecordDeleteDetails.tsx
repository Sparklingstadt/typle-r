import { useTranslations } from 'next-intl'
import { Trophy } from 'lucide-react'
import { useFormat } from '@/i18n/useFormat'
import PracticeName from '@/components/PracticeName'
import { RecordTime } from '@/components/Records/RecordRow'
import { formatAccuracy, listBest, type RecordRow as Row } from '@/core/records'

// What the delete dialog is about to remove, and what becomes the best when it is the list's best.
export default function RecordDeleteDetails({ row, dayHeading }: { row: Row; dayHeading: (day: Date) => string }) {
  const t = useTranslations('records.delete')
  const format = useFormat()
  const { list, record, best } = row
  const date = new Date(record.date)
  const next = best ? listBest({ ...list, records: list.records.filter(item => item !== record) }, row.mode) : undefined
  return <div className="space-y-3">
    <dl className="grid gap-1 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <dt className="sr-only">{t('list')}</dt><dd className="font-medium [overflow-wrap:anywhere]"><PracticeName list={list} /></dd>
      <dt className="sr-only">{t('when')}</dt>
      <dd className="text-[13px] text-muted-foreground">{dayHeading(date)} {format.clock(date)} · {format.device(record.device)}</dd>
      <dt className="sr-only">{t('result')}</dt>
      <dd className="tabular-nums"><RecordTime seconds={record.time} className="font-bold" /><span className="ml-3">{t('accuracy', { value: formatAccuracy(record.accuracy) })}</span><span className="ml-3">{t('mistakes', { value: record.mistakes ?? '—' })}</span></dd>
    </dl>
    {best && <p className="flex gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <Trophy className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{next ? t('bestNext', { time: format.recordTime(next.time), accuracy: formatAccuracy(next.accuracy) }) : t('bestLast')}</span>
    </p>}
  </div>
}
