"use client"
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Copy, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useErrorText } from '@/i18n/useErrorText'
import type { Share } from '@/lib/useShares'

// Makes, updates and stops the link of one pack. The link shows the pack as it was when it was made or last updated.
export default function ShareDialog({ pack, hasCategory, share, onShare, onStop, onOpenChange }: {
  pack: { id: string; name: string } | null
  /** The pack has a category, which the gallery lists it under. */
  hasCategory: boolean
  share: Share | undefined
  onShare: (packId: string, listed?: boolean) => Promise<unknown>
  onStop: (packId: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('wordLists.share')
  const locale = useLocale()
  const errorText = useErrorText()
  const [busy, setBusy] = useState(false)
  // Set at once, where `busy` only changes on the next render, so two clicks in one frame send one request.
  const running = useRef(false)
  const [error, setError] = useState('')
  // The switch's value while its request is on its way; null when it shows what is saved.
  const [pendingListed, setPendingListed] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  // Each copy changes what the live region says (a trailing no-break space every other time), so a copy within the 2 s
  // of the previous one is announced too.
  const [copies, setCopies] = useState(0)
  const copiedTimer = useRef<number | undefined>(undefined)
  const clearCopied = () => { window.clearTimeout(copiedTimer.current); setCopied(false) }
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  async function run(action: (packId: string) => Promise<unknown>) {
    if (!pack || running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try { await action(pack.id) } catch (reason) { setError(errorText(reason, t('failed'))) } finally { running.current = false; setBusy(false) }
  }

  const listed = pendingListed ?? (!!share?.listed && !share.hidden)
  function toggleListed(next: boolean) {
    setPendingListed(next)
    void run(packId => onShare(packId, next)).finally(() => setPendingListed(null))
  }

  const link = share ? `${window.location.origin}/shared/${share.id}` : ''
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      window.clearTimeout(copiedTimer.current)
      setCopied(true)
      setCopies(count => count + 1)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch { setError(t('copyFailed')) }
  }

  return <Dialog open={!!pack} onOpenChange={open => { if (!busy) { setError(''); clearCopied(); onOpenChange(open) } }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('title', { name: pack?.name ?? '' })}</DialogTitle>
        <DialogDescription>{share ? t('sharing') : t('description')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="share-gallery" className="text-sm font-medium">{t('gallery')}</label>
          <Switch id="share-gallery" checked={listed} disabled={busy || !!share?.hidden} onCheckedChange={toggleListed} />
        </div>
        <p className="text-[13px] text-muted-foreground">{share?.hidden ? t('hiddenNotice') : t('galleryNotice')}</p>
        {!share?.hidden && !hasCategory && <p className="text-[13px] text-muted-foreground">{t('galleryCategoryHint')}</p>}
      </div>
      {share && <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input readOnly aria-label={t('link')} value={link} onFocus={event => event.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
          <Button variant="outline" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? t('copied') : t('copy')}</Button>
          {/* The button's own text changes too, but a screen reader only hears it from here. */}
          <span className="sr-only" aria-live="polite">{copied ? t('copied') + (copies % 2 ? '' : '\u00a0') : ''}</span>
        </div>
        <p className="text-[13px] text-muted-foreground">{t('updatedAt', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(share.updatedAt)) })}</p>
        <p className="text-[13px] text-muted-foreground">{t('updateHint')}</p>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        {share ? <>
          <Button variant="outline" disabled={busy} onClick={() => void run(onStop)}>{t('stop')}</Button>
          <Button disabled={busy} onClick={() => void run(onShare)}><RefreshCw aria-hidden="true" />{t('update')}</Button>
        </> : <Button disabled={busy} onClick={() => void run(onShare)}><Link2 aria-hidden="true" />{t('create')}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
