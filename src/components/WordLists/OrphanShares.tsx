"use client"
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useErrorText } from '@/i18n/useErrorText'
import type { OrphanShare } from '@/lib/useShares'
import { CardList } from '@/components/ui/card'

// Share links whose pack the account no longer has. Older versions kept them when a pack went away, so they are
// listed here to be stopped; the pack's name is the one in the shared copy. `focusWhenGone` is the id of the element
// that takes the focus when the last one is stopped.
export default function OrphanShares({ orphans, onStop, focusWhenGone, className }: {
  orphans: OrphanShare[]
  onStop: (packId: string) => Promise<void>
  focusWhenGone: string
  className?: string
}) {
  const t = useTranslations('wordLists.share')
  const locale = useLocale()
  const errorText = useErrorText()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const list = useRef<HTMLUListElement>(null)
  const stopped = useRef<{ packId: string; position: number } | null>(null)
  // An error belongs to the links shown with it.
  if (!orphans.length && error) setError('')

  // Once the stopped link has left the list, its row's place goes to the next one, or the previous one at the end.
  useEffect(() => {
    const pending = stopped.current
    if (!pending || orphans.some(item => item.packId === pending.packId)) return
    stopped.current = null
    const buttons = list.current?.querySelectorAll<HTMLElement>('button') ?? []
    const target = buttons[Math.min(pending.position, buttons.length - 1)]
    if (target) target.focus()
    else document.getElementById(focusWhenGone)?.focus()
  }, [orphans, focusWhenGone])

  if (!orphans.length) return null

  async function stop(packId: string, position: number) {
    if (busy) return
    setBusy(true)
    setError('')
    stopped.current = { packId, position }
    try { await onStop(packId) } catch (reason) {
      stopped.current = null
      setError(errorText(reason, t('failed')))
    } finally { setBusy(false) }
  }

  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return <section aria-labelledby="orphan-shares-heading" className={cn('space-y-2', className)}>
    <h2 id="orphan-shares-heading" className="text-base font-bold">{t('orphans.title')}</h2>
    <p className="text-sm text-muted-foreground">{t('orphans.description')}</p>
    <CardList ref={list}>
      {orphans.map((item, position) => {
        const name = item.name || t('orphans.unnamed')
        return <li key={item.packId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
            <p className="text-[13px] text-muted-foreground">{t('updatedAt', { date: format.format(new Date(item.updatedAt)) })}</p>
          </div>
          <Button variant="outline" disabled={busy} aria-label={t('orphans.stopLabel', { name })} onClick={() => void stop(item.packId, position)}>
            {t('orphans.stop')}
          </Button>
        </li>
      })}
    </CardList>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
