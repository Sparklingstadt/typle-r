"use client"
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useErrorText } from '@/i18n/useErrorText'
import type { OrphanShare } from '@/lib/useShares'

// Share links whose pack the account no longer has. Older versions kept them when a pack went away, so they are
// listed here to be stopped; the pack's name is the one in the shared copy.
export default function OrphanShares({ orphans, onStop, className }: {
  orphans: OrphanShare[]
  onStop: (packId: string) => Promise<void>
  className?: string
}) {
  const t = useTranslations('wordLists.share')
  const locale = useLocale()
  const errorText = useErrorText()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!orphans.length) return null

  async function stop(packId: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await onStop(packId) } catch (reason) { setError(errorText(reason, t('failed'))) } finally { setBusy(false) }
  }

  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return <section aria-labelledby="orphan-shares-heading" className={cn('space-y-2', className)}>
    <h2 id="orphan-shares-heading" className="text-base font-bold">{t('orphans.title')}</h2>
    <p className="text-sm text-muted-foreground">{t('orphans.description')}</p>
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {orphans.map(item => {
        const name = item.name || t('orphans.unnamed')
        return <li key={item.packId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
            <p className="text-[13px] text-muted-foreground">{t('updatedAt', { date: format.format(new Date(item.updatedAt)) })}</p>
          </div>
          <Button variant="outline" disabled={busy} aria-label={t('orphans.stopLabel', { name })} onClick={() => void stop(item.packId)}>
            {t('orphans.stop')}
          </Button>
        </li>
      })}
    </ul>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
