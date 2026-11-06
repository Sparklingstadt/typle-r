"use client"
import { Fragment } from "react"
import { useTranslations } from "next-intl"
import { Check, Keyboard, Minus } from "lucide-react"
import { DeltaText, changeDelta, pointDifference, weekDelta, type Delta } from "@/components/Dashboard/Delta"
import { useFormat } from "@/i18n/useFormat"
import type { DashboardSummary } from "@/core/dashboard"

function Stat({ label, parts, delta }: { label: string; parts: [string, string][]; delta: Delta }) {
  // Languages that put a space between a number and its unit get a little more room; a percent sign stays attached.
  const spaced = useFormat().unitSpace !== ''
  return <div className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
    <dt className="text-[13px] text-muted-foreground">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-x-0.5">
      {parts.map(([value, unit]) => <Fragment key={unit}><span className="text-2xl font-semibold xl:text-3xl">{value}</span><span className={`mr-1 text-sm text-muted-foreground${spaced && unit !== '%' ? ' ml-1' : ''}`}>{unit}</span></Fragment>)}
    </dd>
    <dd><DeltaText {...delta} /></dd>
  </div>
}

export default function WeekStats({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations('dashboard')
  const format = useFormat()
  const { accuracy } = summary
  return <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
    <Stat label={t('week.count')} parts={[[String(summary.weekCount), t('week.countUnit', { count: summary.weekCount })]]}
      delta={weekDelta(t, summary.weekCount, summary.previousWeekCount, value => t('week.times', { count: value }))} />
    <Stat label={t('week.streak')} parts={[[String(summary.streak), t('week.streakUnit', { count: summary.streak })]]} delta={summary.practicedToday
      ? { icon: Check, good: true, text: t('week.practisedToday') }
      : { icon: Keyboard, good: false, text: t('week.streakNext', { day: summary.streak + 1 }) }} />
    <Stat label={t('week.accuracy', { count: accuracy?.recentCount ?? 10 })} parts={[accuracy ? [accuracy.recent.toFixed(1), '%'] : ['—', '']]}
      delta={accuracy?.change ? changeDelta(t, accuracy.change, false, pointDifference, false)
        : { icon: Minus, good: false, text: t(accuracy ? 'week.noComparison' : 'week.noAccuracy') }} />
    <Stat label={t('week.time')} parts={format.durationParts(summary.weekSeconds)} delta={weekDelta(t, summary.weekSeconds, summary.previousWeekSeconds, format.duration)} />
  </dl>
}
