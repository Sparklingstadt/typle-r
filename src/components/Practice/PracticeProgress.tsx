"use client"
import { useTranslations } from 'next-intl'

// The bar under the practice card's header: words done out of the list's words.
export default function PracticeProgress({ index, total, finished }: { index: number; total: number; finished: boolean }) {
  const t = useTranslations('practice.progress')
  const text = t('value', { current: finished ? total : index + 1, total })
  return <div className="flex items-center gap-3 px-4 pt-3 text-sm font-medium tabular-nums sm:px-6 sm:pt-4">
    <div role="progressbar" aria-label={t('label')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished ? total : index} aria-valuetext={text} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${(finished ? 1 : index / total) * 100}%` }} />
    </div>
    <span aria-hidden="true">{text}</span>
  </div>
}
