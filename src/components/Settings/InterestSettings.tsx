"use client"
import { useTranslations } from 'next-intl'
import { INTEREST_OPTIONS, toggleInterest } from '@/core/interests'
import { cn } from '@/lib/utils'

type Props = {
  interests: string[]
  saving: boolean
  updateInterests: (change: (current: string[]) => string[]) => Promise<boolean>
}

// Choosing saves at once. The buttons stay disabled while saving; a failed save leaves the last saved choice (the page shows the error).
export default function InterestSettings({ interests, saving, updateInterests }: Props) {
  const t = useTranslations('interests')
  const chosen = new Set(interests)
  const toggle = (id: string) => void updateInterests(current => toggleInterest(current, id))
  const chip = (id: string, label: string) => <button key={id} type="button" aria-pressed={chosen.has(id)} disabled={saving} onClick={() => toggle(id)}
    className={cn('inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
      chosen.has(id) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>{label}</button>
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2">
      {INTEREST_OPTIONS.map(option => chip(option.id, t(`parents.${option.id as 'language'}`)))}
    </div>
    {INTEREST_OPTIONS.filter(option => chosen.has(option.id)).map(option => {
      const parent = t(`parents.${option.id as 'language'}`)
      return <section key={option.id} role="group" aria-label={t('childrenLabel', { parent })} className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-bold">{parent}</h2>
        <div className="flex flex-wrap gap-2">
          {option.children.map(item => chip(item.id, t(`children.${option.id as 'language'}.${item.id.split('/')[1] as 'zh'}`)))}
        </div>
      </section>
    })}
  </div>
}
