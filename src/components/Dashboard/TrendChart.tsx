"use client"
import { useState, type KeyboardEvent, type PointerEvent } from "react"
import { useTranslations } from "next-intl"
import { useFormat } from "@/i18n/useFormat"
import type { Scale, TrendPoint } from "@/lib/dashboard"

// A 0–100 viewBox stretched to the box keeps the chart fluid; strokes and markers stay crisp via
// non-scaling strokes and HTML dots positioned in percent.
export default function TrendChart({ label, points, scale, format }: {
  label: string
  points: TrendPoint[]
  scale: Scale
  format: (value: number) => string
}) {
  const t = useTranslations('dashboard.chart')
  const dates = useFormat()
  const shortDate = (date: string) => dates.shortDate(new Date(date))
  const longDate = (date: string) => dates.shortDateTime(new Date(date))
  const [active, setActive] = useState<number | null>(null)
  const last = points.length - 1
  const [low, high] = scale.domain
  const x = (index: number) => index / last * 100
  const y = (value: number) => (1 - (value - low) / (high - low)) * 100
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index)} ${y(point.value)}`).join(' ')
  const shown = active ?? last
  const point = points[shown]
  const valueText = `${longDate(point.date)} ${format(point.value)}`

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    setActive(Math.min(last, Math.max(0, Math.round((event.clientX - box.left) / box.width * last))))
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = { ArrowLeft: shown - 1, ArrowRight: shown + 1, Home: 0, End: last }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setActive(Math.min(last, Math.max(0, next)))
  }

  return <figure className="flex flex-col gap-1">
    <div className="flex gap-1.5">
      <div aria-hidden="true" className="relative my-2 w-8 shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {scale.ticks.map(tick => <span key={tick} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${y(tick)}%` }}>{tick.toFixed(scale.decimals)}</span>)}
      </div>
      <div role="slider" tabIndex={0} aria-label={t('label', { label })} aria-valuemin={1} aria-valuemax={points.length} aria-valuenow={shown + 1} aria-valuetext={valueText}
        className="relative h-[72px] min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-sm py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onPointerMove={pointerMove} onPointerDown={pointerMove} onPointerLeave={() => setActive(null)} onFocus={() => setActive(last)} onBlur={() => setActive(null)} onKeyDown={keyDown}>
        <div className="relative mx-1 h-full">
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {scale.ticks.map(tick => <line key={tick} x1={0} x2={100} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            <path d={`${line} L${x(last)} 100 L0 100 Z`} className="fill-trend/10" />
            <path d={line} className="stroke-trend" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {active !== null && <line x1={x(active)} x2={x(active)} y1={0} y2={100} className="stroke-muted-foreground/60" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          <span aria-hidden="true" className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-trend ring-2 ring-card" style={{ left: `${x(shown)}%`, top: `${y(point.value)}%` }} />
          {active !== null && <div aria-hidden="true" className="pointer-events-none absolute bottom-full z-10 mb-3 flex flex-col whitespace-nowrap rounded-md bg-popover px-2 py-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ left: `${x(active)}%`, transform: `translateX(${x(active) < 25 ? '-8px' : x(active) > 75 ? 'calc(-100% + 8px)' : '-50%'})` }}>
            <span className="text-sm font-semibold tabular-nums">{format(point.value)}</span>
            <span className="text-xs text-muted-foreground">{longDate(point.date)}</span>
          </div>}
        </div>
      </div>
    </div>
    <figcaption aria-hidden="true" className="flex justify-between pl-10 text-[11px] text-muted-foreground tabular-nums">
      <span>{shortDate(points[0].date)}</span><span>{shortDate(points[last].date)}</span>
    </figcaption>
    <table className="sr-only">
      <caption>{label}</caption>
      <thead><tr><th scope="col">{t('date')}</th><th scope="col">{t('value')}</th></tr></thead>
      <tbody>{points.map((item, index) => <tr key={index}><td>{longDate(item.date)}</td><td>{format(item.value)}</td></tr>)}</tbody>
    </table>
  </figure>
}
