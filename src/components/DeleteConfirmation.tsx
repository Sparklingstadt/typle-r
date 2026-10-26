"use client"
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
  AlertDialogAction } from '@/components/ui/alert-dialog'

// Uncontrolled by default with its own delete button. Pass `open` to control it from a page whose rows unmount on
// deletion; `onCloseAutoFocus` then decides where focus goes, since the row that opened it may be gone.
export default function DeleteConfirmation({ label, title, description, children, onConfirm, open: controlledOpen, onOpenChange, onCloseAutoFocus, confirmLabel, busyLabel }: {
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
  /** The confirm button's text and its text while working, for a deletion that has another name such as フォロー解除. */
  confirmLabel?: string
  busyLabel?: string
}) {
  const t = useTranslations('common.delete')
  const form = useTranslations('common.form')
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
        <AlertDialogCancel disabled={busy}>{form('cancel')}</AlertDialogCancel>
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
        }}>{busy ? busyLabel ?? t('deleting') : confirmLabel ?? t('confirm')}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
