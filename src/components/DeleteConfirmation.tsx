"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
  AlertDialogAction } from '@/components/ui/alert-dialog'

// Uncontrolled by default with its own 削除 button. Pass `open` to control it from a page whose rows unmount on
// deletion; `onCloseAutoFocus` then decides where focus goes, since the row that opened it may be gone.
export default function DeleteConfirmation({ label = '削除', title = '削除してもよろしいですか？', description, onConfirm, open: controlledOpen, onOpenChange, onCloseAutoFocus }: {
  /** Accessible name of the built-in 削除 button (uncontrolled use). */
  label?: string
  title?: string
  description: string
  onConfirm: () => Promise<boolean>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
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
    {!controlled && <AlertDialogTrigger asChild><Button variant="destructive" aria-label={label}>削除</Button></AlertDialogTrigger>}
    <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description} この操作は取り消せません。</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} onClick={async event => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            if (await onConfirm()) setOpen(false)
            else setError('削除できませんでした。もう一度お試しください。')
          } catch { setError('削除できませんでした。もう一度お試しください。') }
          finally { setBusy(false) }
        }}>{busy ? '削除中…' : '削除する'}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
