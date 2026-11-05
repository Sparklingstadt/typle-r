import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import { dayKind } from '@/core/dashboard'

// Today and yesterday are named before the date; other days show the date alone.
export function useDayHeading(now: Date) {
  const t = useTranslations('records.day')
  const format = useFormat()
  return (day: Date) => {
    const date = format.dateWithWeekday(day, now)
    const kind = dayKind(day, now)
    return kind === 'today' || kind === 'yesterday' ? t('heading', { relative: format.day(day, now), date }) : date
  }
}
