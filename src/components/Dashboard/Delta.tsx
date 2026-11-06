import type { useTranslations } from "next-intl"
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import type { Change } from "@/core/dashboard"

export type Delta = { icon: LucideIcon; good: boolean; text: string }
export type T = ReturnType<typeof useTranslations<'dashboard'>>

export function DeltaText({ icon: Icon, good, text }: Delta) {
  return <p className={`flex gap-1 text-xs ${good ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
    <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{text}
  </p>
}

export function weekDelta(t: T, current: number, previous: number, format: (value: number) => string): Delta {
  if (format(Math.abs(current - previous)) === format(0)) return { icon: Minus, good: false, text: t('week.sameAsLastWeek') }
  const more = current > previous
  const value = format(Math.abs(current - previous))
  return { icon: more ? TrendingUp : TrendingDown, good: more, text: t(more ? 'week.moreThanLastWeek' : 'week.lessThanLastWeek', { value }) }
}

// `describe` returns null when the rounded difference is zero. Stat tiles already name the recent window in their label.
export function changeDelta(t: T, change: Change, lowerIsBetter: boolean, describe: (t: T, difference: number) => string | null, namedRecent = true): Delta {
  const values = {
    recent: !namedRecent ? 'none' : change.recentCount === 1 ? 'latest' : 'average',
    recentCount: change.recentCount,
    previous: change.previousCount === 1 ? 'latest' : 'average',
    previousCount: change.previousCount,
  }
  const difference = change.recent - change.previous
  const text = describe(t, difference)
  if (!text) return { icon: Minus, good: false, text: t('change.same', values) }
  return { icon: difference > 0 ? TrendingUp : TrendingDown, good: difference > 0 !== lowerIsBetter, text: t('change.different', { ...values, difference: text }) }
}

export const secondsDifference = (t: T, difference: number) => {
  const value = Math.abs(difference).toFixed(2)
  return value === '0.00' ? null : t('change.seconds', { value, direction: difference > 0 ? 'up' : 'down' })
}
export const pointDifference = (t: T, difference: number) => {
  const value = Math.abs(difference).toFixed(1)
  return value === '0.0' ? null : t('change.points', { value, direction: difference > 0 ? 'up' : 'down' })
}
