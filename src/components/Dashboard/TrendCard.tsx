"use client"
import { useId } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DeltaText, changeDelta, pointDifference, secondsDifference, type T } from "@/components/Dashboard/Delta"
import { practiceHref } from "@/components/Dashboard/NextLists"
import TrendChart from "@/components/Dashboard/TrendChart"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import { useFormat } from "@/i18n/useFormat"
import { accuracyScale, speedScale, type ListTrend, type Scale, type Trend } from "@/core/dashboard"

function Metric({ title, trend, scale, withUnit, lowerIsBetter, describe }: {
  title: string
  trend: Trend
  scale: Scale | null
  withUnit: (value: number) => string
  lowerIsBetter: boolean
  describe: (t: T, difference: number) => string | null
}) {
  const t = useTranslations('dashboard')
  const latest = trend.points[trend.points.length - 1]
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <h4 className="text-[13px] text-muted-foreground">{title}</h4>
      {latest && <p className="text-xs text-muted-foreground">{t.rich('trends.latest', { value: withUnit(latest.value), number: chunks => <span className="text-base font-semibold text-foreground">{chunks}</span> })}</p>}
    </div>
    {trend.change && <DeltaText {...changeDelta(t, trend.change, lowerIsBetter, describe)} />}
    {scale ? <TrendChart label={title} points={trend.points} scale={scale} format={withUnit} />
      : <p className="text-sm text-muted-foreground">{t('trends.noChart')}</p>}
  </div>
}

export default function TrendCard({ trend, now }: { trend: ListTrend; now: Date }) {
  const t = useTranslations('dashboard')
  const practiceName = usePracticeName()
  const format = useFormat()
  const id = useId()
  const { list, best } = trend
  const speed = trend.speed.points.map(point => point.value)
  const accuracy = trend.accuracy.points.map(point => point.value)
  return <article aria-labelledby={id} className="flex flex-col gap-5 rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5">
    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 id={id} className="font-medium break-words"><PracticeName list={list} /></h3>
      <p className="text-[13px] text-muted-foreground">{t('trends.summary', { count: trend.count, day: format.day(trend.lastPracticed, now) })}</p>
    </header>
    {trend.count < 2 ? <>
      <p className="text-sm text-muted-foreground">{t('trends.needTwo')}</p>
      <Button asChild variant="outline" className="self-start"><Link href={practiceHref(list)} aria-label={t('trends.practiceList', { name: practiceName(list) })}><Keyboard aria-hidden="true" />{t('trends.practice')}</Link></Button>
    </> : <>
      <Metric title={t('trends.speed')} trend={trend.speed} scale={speed.length > 1 ? speedScale(speed) : null} withUnit={value => t('trends.seconds', { value: value.toFixed(2) })} lowerIsBetter describe={secondsDifference} />
      <Metric title={t('trends.accuracy')} trend={trend.accuracy} scale={accuracy.length > 1 ? accuracyScale(accuracy) : null} withUnit={value => t('trends.percent', { value: value.toFixed(1) })} lowerIsBetter={false} describe={pointDifference} />
      <p className="border-t pt-3 text-[13px] text-muted-foreground">
        {t('trends.best', { accuracy: best.accuracy === undefined ? t('trends.notRecorded') : `${best.accuracy}%`, time: best.time.toFixed(2), day: format.day(new Date(best.date), now) })}
      </p>
    </>}
  </article>
}
