"use client"
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AppError, type ErrorKey } from '@/core/appError'
import { ApiError, api } from '@/core/api'
import { useErrorText } from '@/i18n/useErrorText'

const REASONS = ['inappropriate', 'spam', 'personalInfo', 'other'] as const
type Reason = (typeof REASONS)[number]

// Server errors that have a message of their own; others show the dialog's general text.
const REPORT_ERRORS = new Set<unknown>(['notInGallery', 'invalidReport', 'databaseUnavailable', 'forbiddenRequest', 'tooManyRequests'] satisfies ErrorKey[])

async function report(id: string, reason: Reason) {
  try {
    await api('/api/gallery/reports', { method: 'POST', body: { id, reason } })
  } catch (reason) {
    if (reason instanceof ApiError && REPORT_ERRORS.has(reason.key)) throw new AppError(reason.key as ErrorKey)
    throw reason instanceof ApiError ? new Error(`Report request failed: ${reason.status}`) : reason
  }
}

// Sends a report of one shared pack in the gallery. The reporter chooses one of four reasons; nothing about them is sent.
export default function ReportDialog({ shareId, open, onOpenChange, onSent }: {
  shareId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const t = useTranslations('wordLists.report')
  const errorText = useErrorText()
  const [reason, setReason] = useState<Reason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!reason || busy) return
    setBusy(true)
    setError('')
    try {
      await report(shareId, reason)
      setReason(null)
      onOpenChange(false)
      onSent()
    } catch (failure) { setError(errorText(failure, t('failed'))) } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={next => { if (busy) return; setError(''); if (!next) setReason(null); onOpenChange(next) }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <fieldset className="space-y-2">
        <legend className="sr-only">{t('reason')}</legend>
        {REASONS.map(value => <label key={value} className="flex items-center gap-2 text-sm">
          <input type="radio" name="report-reason" value={value} checked={reason === value} disabled={busy}
            onChange={() => setReason(value)} className="size-4 accent-primary" />
          {t(`reasons.${value}`)}
        </label>)}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button disabled={!reason || busy} onClick={() => void send()}>{t('send')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
