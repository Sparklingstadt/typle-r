"use client"
import { useTranslations } from "next-intl"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

// Asks before leaving an editor with unsaved changes.
export default function DiscardChangesDialog({ open, onOpenChange, onDiscard }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}) {
  const t = useTranslations("wordLists.editor")
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
        <AlertDialogDescription>{t("discardDescription")}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onDiscard}>{t("discard")}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
