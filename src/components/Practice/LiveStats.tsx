"use client"
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Gauge, Target, Timer, X } from 'lucide-react'
import type { PracticeMode } from '@/core/records'
import { elapsedTime, typingSpeed, type TypingSession } from '@/core/typing'

// Ticks only while a session is running, for the live elapsed time and speed.
function useNow(active: boolean) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function formatClock(milliseconds: number) {
  const seconds = Math.max(0, milliseconds) / 1000
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

// Owns the ticking clock, so only these four values re-render every 200ms instead of the whole page.
// In Writing a judged word is the unit, so the speed is in words per minute.
export default function LiveStats({ session, accuracy, mode = 'normal' }: { session: TypingSession; accuracy: number; mode?: PracticeMode }) {
  const running = session.startedAt !== null && session.finishedAt === null
  // While paused the values stand still, so the clock stops ticking too.
  const now = useNow(running && session.pausedAt == null)
  const elapsed = running ? elapsedTime(session, now) : 0
  const speed = running ? typingSpeed(session, now) : null
  const t = useTranslations('practice.stats')
  const stats = [
    { icon: Timer, term: t('elapsed'), value: formatClock(elapsed) },
    { icon: Gauge, term: t('speed'), value: speed === null ? '—' : String(speed), unit: t(mode === 'writing' ? 'wordSpeedUnit' : 'speedUnit') },
    { icon: Target, term: t('accuracy'), value: session.attempts ? `${Math.round(accuracy * 10) / 10}%` : '—' },
    { icon: X, term: t('mistakes'), value: String(session.mistakes) },
  ]
  return <dl aria-label={t('label')} className="mx-4 mb-4 grid grid-cols-4 rounded-xl border bg-muted/40 px-1 py-2.5 text-center sm:mx-6 sm:mb-5 sm:px-2 sm:py-3">
    {stats.map(stat => <div key={stat.term} className="grid gap-0.5">
      <dt className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground sm:text-xs"><stat.icon className="size-3" aria-hidden="true" />{stat.term}</dt>
      <dd className="text-base font-medium tabular-nums sm:text-xl">{stat.value}{stat.unit && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground sm:text-xs">{stat.unit}</span>}</dd>
    </div>)}
  </dl>
}
