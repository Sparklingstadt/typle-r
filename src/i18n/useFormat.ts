'use client'
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { dayKind, durationParts } from '@/core/dashboard'
import { DEFAULT_DEVICE_ID, type PracticeDevice } from '@/core/devices'
import { recordTimeParts, type TimeUnit } from '@/core/records'

type Parts = [string, TimeUnit][]

const dateOptions = {
  monthDay: { month: 'short', day: 'numeric' },
  yearMonthDay: { year: 'numeric', month: 'short', day: 'numeric' },
  numericDate: { year: 'numeric', month: 'numeric', day: 'numeric' },
  weekday: { weekday: 'short' },
  clock: { hour: '2-digit', minute: '2-digit' },
  shortDate: { month: 'numeric', day: 'numeric' },
  shortDateTime: { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

// Building a DateTimeFormat is costly and rows call this hook many times, so each language's formatters are made once.
const cache = new Map<string, Record<keyof typeof dateOptions, Intl.DateTimeFormat>>()
function dateFormats(locale: string) {
  let formats = cache.get(locale)
  if (!formats) {
    formats = Object.fromEntries(Object.entries(dateOptions).map(([name, options]) =>
      [name, new Intl.DateTimeFormat(locale, options)])) as Record<keyof typeof dateOptions, Intl.DateTimeFormat>
    cache.set(locale, formats)
  }
  return formats
}

// Dates, durations and device names in the reader's language. The lib functions stay language-neutral and this
// hook is the one place that turns their results into text.
export function useFormat() {
  const locale = useLocale()
  const t = useTranslations('format')
  return useMemo(() => {
    const formats = dateFormats(locale)
    const unit = (name: TimeUnit) => t(`units.${name}`)
    const text = (parts: Parts) => {
      const [[first, firstUnit], second] = parts
      if (!second) return t('time.one', { value: first, unit: unit(firstUnit) })
      return t('time.two', { first, firstUnit: unit(firstUnit), second: second[0], secondUnit: unit(second[1]) })
    }
    const date = (value: Date, now: Date) =>
      (dayKind(value, now) === 'otherYear' ? formats.yearMonthDay : formats.monthDay).format(value)
    // The built-in device reads in the reader's language, whatever language its records were made in.
    const deviceName = (value: PracticeDevice) => value.id === DEFAULT_DEVICE_ID ? t('defaultDevice') : value.name
    const device = (value?: PracticeDevice) => !value ? t('noDevice')
      : value.layout ? t('deviceWithLayout', { name: deviceName(value), layout: value.layout }) : deviceName(value)
    return {
      /** A count with the reader's grouping of digits. */
      number: (value: number) => value.toLocaleString(locale),
      /** 今日, 昨日 or the date, with the year only when it is not this year. */
      day(value: Date, now = new Date()) {
        const kind = dayKind(value, now)
        return kind === 'today' ? t('today') : kind === 'yesterday' ? t('yesterday') : date(value, now)
      },
      /** The date with its day of the week, such as 9月19日（土）. */
      dateWithWeekday: (value: Date, now = new Date()) => t('dateWithWeekday', { date: date(value, now), weekday: formats.weekday.format(value) }),
      /** 9月19日, without the year. */
      monthDay: (value: Date) => formats.monthDay.format(value),
      /** 2026/9/19, for labels that must name the day on their own. */
      numericDate: (value: Date) => formats.numericDate.format(value),
      /** 9/19-style date, for chart axes. */
      shortDate: (value: Date) => formats.shortDate.format(value),
      shortDateTime: (value: Date) => formats.shortDateTime.format(value),
      clock: (value: Date) => formats.clock.format(value),
      /** What goes between a number and its unit when they are styled apart: nothing in Japanese and Chinese, a space elsewhere. */
      unitSpace: /\s/.test(t('time.one', { value: '1', unit: 'x' })) ? ' ' : '',
      /** Practice time as value and unit pairs, for showing the unit smaller than the number. */
      durationParts: (seconds: number) => durationParts(seconds).map(([value, name]) => [value, unit(name)] as [string, string]),
      duration: (seconds: number) => text(durationParts(seconds)),
      recordTimeParts: (seconds: number) => recordTimeParts(seconds).map(([value, name]) => [value, unit(name)] as [string, string]),
      recordTime: (seconds: number) => text(recordTimeParts(seconds)),
      /** A device's name alone, such as デフォルト for the built-in device. */
      deviceName,
      /** A device with its layout, or 未記録 when there is none. */
      device,
      /** The device a record was made on, or 端末の記録なし for records made without one. */
      recordDevice: (value?: PracticeDevice) => value ? device(value) : t('noDeviceRecorded'),
    }
  }, [locale, t])
}
