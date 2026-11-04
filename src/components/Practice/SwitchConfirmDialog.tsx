"use client"
import { useTranslations } from "next-intl"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

export default function SwitchConfirmDialog({ open, description, onCancel, onConfirm, onCloseAutoFocus }: {
  open: boolean
  description: string
  onCancel: () => void
  onConfirm: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const t = useTranslations('practice')
  return <AlertDialog open={open} onOpenChange={open => { if (!open) onCancel() }}>
    <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('switch.title')}</AlertDialogTitle>
        <AlertDialogDescription>
          {description}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('switch.continue')}</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>{t('switch.confirm')}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
