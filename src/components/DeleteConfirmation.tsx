"use client"
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
  AlertDialogAction } from '@/components/ui/alert-dialog'

// Uncontrolled by default with its own delete button. Pass `open` to control it from a page whose rows unmount on
// deletion; `onCloseAutoFocus` then decides where focus goes, since the row that opened it may be gone.
export default function DeleteConfirmation({ label, title, description, children, onConfirm, open: controlledOpen, onOpenChange, onCloseAutoFocus }: {
  /** Accessible name of the built-in delete button (uncontrolled use). */
  label?: string
  title?: string
  description: string
  /** Details of what is deleted, shown between the description and the buttons. */
  children?: ReactNode
  onConfirm: () => Promise<boolean>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const t = useTranslations('common.delete')
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : uncontrolledOpen
  function setOpen(value: boolean) {
    if (!controlled) setUncontrolledOpen(value)
    onOpenChange?.(value)
  }
  return <AlertDialog open={open} onOpenChange={value => {
    if (!busy) { setOpen(value); setError('') }
  }}>
    {!controlled && <AlertDialogTrigger asChild><Button variant="destructive" aria-label={label ?? t('label')}>{t('label')}</Button></AlertDialogTrigger>}
    <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title ?? t('title')}</AlertDialogTitle>
        <AlertDialogDescription>{t('description', { description })}</AlertDialogDescription>
      </AlertDialogHeader>
      {children}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} onClick={async event => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            if (await onConfirm()) setOpen(false)
            else setError(t('failed'))
          } catch { setError(t('failed')) }
          finally { setBusy(false) }
        }}>{busy ? t('deleting') : t('confirm')}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
