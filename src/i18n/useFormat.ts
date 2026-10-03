'use client'
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { dayKind, durationParts } from '@/lib/dashboard'
import type { PracticeDevice } from '@/lib/devices'
import { recordTimeParts, type TimeUnit } from '@/lib/records'

type Parts = [string, TimeUnit][]

// Dates, durations and device names in the reader's language. The lib functions stay language-neutral and this
// hook is the one place that turns their results into text.
export function useFormat() {
  const locale = useLocale()
  const t = useTranslations('format')
  return useMemo(() => {
    const monthDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    const yearMonthDay = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
    const shortDate = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' })
    const shortDateTime = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
    const unit = (name: TimeUnit) => t(`units.${name}`)
    const text = (parts: Parts) => {
      const [[first, firstUnit], second] = parts
      if (!second) return t('time.one', { value: first, unit: unit(firstUnit) })
      return t('time.two', { first, firstUnit: unit(firstUnit), second: second[0], secondUnit: unit(second[1]) })
    }
    const date = (value: Date, now: Date) =>
      (dayKind(value, now) === 'otherYear' ? yearMonthDay : monthDay).format(value)
    return {
      /** 今日, 昨日 or the date, with the year only when it is not this year. */
      day(value: Date, now = new Date()) {
        const kind = dayKind(value, now)
        return kind === 'today' ? t('today') : kind === 'yesterday' ? t('yesterday') : date(value, now)
      },
      /** The date with its day of the week, such as 9月19日（土）. */
      dateWithWeekday: (value: Date, now = new Date()) => t('dateWithWeekday', { date: date(value, now), weekday: weekday.format(value) }),
      /** 9/19-style date, for chart axes. */
      shortDate: (value: Date) => shortDate.format(value),
      shortDateTime: (value: Date) => shortDateTime.format(value),
      /** A full date such as 2026/09/19, for labels that must stand on their own. */
      fullDate: (value: Date) => fullDate.format(value),
      clock: (value: Date) => clock.format(value),
      /** Practice time as value and unit pairs, for showing the unit smaller than the number. */
      durationParts: (seconds: number) => durationParts(seconds).map(([value, name]) => [value, unit(name)] as [string, string]),
      duration: (seconds: number) => text(durationParts(seconds)),
      recordTimeParts: (seconds: number) => recordTimeParts(seconds).map(([value, name]) => [value, unit(name)] as [string, string]),
      recordTime: (seconds: number) => text(recordTimeParts(seconds)),
      /** A device with its layout, or 未記録 when a record has none. */
      device: (device?: PracticeDevice) => !device ? t('noDevice')
        : device.layout ? t('deviceWithLayout', { name: device.name, layout: device.layout }) : device.name,
    }
  }, [locale, t])
}
