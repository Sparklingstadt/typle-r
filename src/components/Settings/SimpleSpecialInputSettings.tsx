"use client"
import { useId, useState } from 'react'
import { CaseSensitive } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { setSimpleSpecialInput, useSimpleSpecialInput } from '@/lib/inputSettings'
import { cn } from '@/lib/utils'

// The toggle applies at once: practice reads the same per-browser setting.
export default function SimpleSpecialInputSettings() {
  const t = useTranslations('input.simpleSpecial')
  const enabled = useSimpleSpecialInput()
  const id = useId()
  const [unsaved, setUnsaved] = useState(false)

  return <section aria-labelledby={`${id}-heading`} className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:gap-x-4">
      <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><CaseSensitive className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-1">
        <h2 id={`${id}-heading`} className="font-bold">{t('heading')}</h2>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
    </div>
    <div className="mt-4 flex items-center gap-3 rounded-lg border px-3 py-2.5 sm:ml-14">
      <label htmlFor={`${id}-switch`} className="min-w-0 flex-1 cursor-pointer">
        <span className="block font-medium">{t('label')}</span>
        <span id={`${id}-hint`} className="block text-xs text-muted-foreground">{t('hint')}</span>
      </label>
      <Switch id={`${id}-switch`} checked={enabled} aria-describedby={`${id}-hint ${id}-description`}
        onCheckedChange={checked => setUnsaved(!setSimpleSpecialInput(checked))} />
    </div>
    <p role="status" aria-live="polite" className={cn('mt-3 text-[13px] sm:pl-14', unsaved ? 'text-destructive' : 'text-muted-foreground')}>
      {unsaved ? t('unsaved') : t('note')}
    </p>
  </section>
}
