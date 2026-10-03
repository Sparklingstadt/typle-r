"use client"
import { useId, useState, useTransition } from 'react'
import { Check, Languages } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { setLocale } from '@/i18n/actions'
import { localeNames, locales, type Locale } from '@/i18n/config'
import { cn } from '@/lib/utils'

// Choosing a language applies it at once: the server action stores it in a cookie and the page re-renders in it.
export default function LanguageSettings() {
  const t = useTranslations('settings')
  const current = useLocale()
  const id = useId()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'changed' | 'failed'>('idle')

  function choose(locale: Locale) {
    if (locale === current || pending) return
    setStatus('idle')
    startTransition(async () => {
      try {
        await setLocale(locale)
        setStatus('changed')
      } catch { setStatus('failed') }
    })
  }

  return <section aria-labelledby={`${id}-heading`} className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:gap-x-4">
      <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><Languages className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-1">
        <h2 id={`${id}-heading`} className="font-bold">{t('language.heading')}</h2>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">{t('language.description')}</p>
      </div>
    </div>
    <fieldset aria-labelledby={`${id}-heading`} aria-describedby={`${id}-description`} disabled={pending} className="mt-4 grid gap-2 sm:grid-cols-2 sm:pl-14">
      {locales.map(locale => {
        const checked = locale === current
        return <label key={locale} className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
          checked ? 'border-primary bg-accent' : 'hover:bg-muted/60', pending && 'cursor-progress opacity-70')}>
          <input type="radio" name={`${id}-locale`} value={locale} checked={checked} onChange={() => choose(locale)} className="sr-only" />
          <span className="min-w-0 flex-1">
            <span lang={locale} className="block font-medium">{localeNames[locale]}</span>
            <span className="block text-xs text-muted-foreground">{t(`languages.${locale}`)}</span>
          </span>
          {checked ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary"><Check className="size-4" aria-hidden="true" />{t('language.current')}</span>
            : <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />}
        </label>
      })}
    </fieldset>
    <p role="status" aria-live="polite" className={cn('mt-3 text-[13px] sm:pl-14', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
      {pending ? t('language.changing') : status === 'changed' ? t('language.changed', { language: t(`languages.${current}`) })
        : status === 'failed' ? t('language.failed') : t('language.note')}
    </p>
  </section>
}
