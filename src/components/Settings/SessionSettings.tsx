"use client"
import { useId, useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
  AlertDialogAction } from '@/components/ui/alert-dialog'
import { signOutEverywhere, useSession } from '@/lib/session'

// Signing out of every device, for an account signed in to the cloud: shown only then, as a guest has no session.
export default function SessionSettings() {
  const t = useTranslations('settings.sessions')
  const form = useTranslations('common.form')
  const { status } = useSession()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (status !== 'authenticated') return null

  return <section aria-labelledby={`${id}-heading`} className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:gap-x-4">
      <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><MonitorSmartphone className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-1">
        <h2 id={`${id}-heading`} className="font-bold">{t('heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
    </div>
    <div className="mt-4 sm:pl-14">
      <AlertDialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setFailed(false) } }}>
        <AlertDialogTrigger asChild><Button variant="outline">{t('action')}</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          {failed && <p role="alert" className="text-sm text-destructive">{t('failed')}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{form('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={async event => {
              event.preventDefault()
              if (busy) return
              setBusy(true)
              setFailed(false)
              // On success the page goes home, so the dialog stays busy until it is gone.
              try { await signOutEverywhere() } catch { setFailed(true); setBusy(false) }
            }}>{busy ? t('signingOut') : t('confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </section>
}
