"use client"
import { useTranslations } from 'next-intl'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { useSaveNotification } from '@/components/SaveNotification'
import { deletePack } from '@/core/packEditing'
import type { Library } from '@/core/wordPacks'

// Asks before a followed pack is unfollowed, which deletes it with its records. Controlled by the screen that opens it.
export default function UnfollowDialog({ pack, onOpenChange, onCloseAutoFocus, updateLibrary, onUnfollowed }: {
  /** The pack to unfollow while the dialog is open, otherwise null. */
  pack: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
  updateLibrary: (change: (library: Library) => Library) => Promise<boolean>
  onUnfollowed?: () => void
}) {
  const t = useTranslations('wordLists.follow')
  const notify = useSaveNotification()
  // The name stays while the dialog closes, so its text does not change as it fades out.
  return pack && <DeleteConfirmation open onOpenChange={onOpenChange} onCloseAutoFocus={onCloseAutoFocus}
    title={t('title', { name: pack.name })} description={t('description', { name: pack.name })}
    confirmLabel={t('confirm')} busyLabel={t('confirming')}
    onConfirm={async () => {
      const saved = await updateLibrary(library => deletePack(library, pack.id))
      if (saved) {
        notify(t('done', { name: pack.name }))
        onUnfollowed?.()
      }
      return saved
    }} />
}
