"use client"
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { decodeLists, SavedWordList } from '@/core/wordLists'
import { LEGACY_STORAGE_KEY, mergeLegacy, prepareLegacy } from '@/plugins/formats/legacy'

export default function LegacyImport({ update, disabled }: {
  update: (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>
  disabled: boolean
}) {
  const { data: session } = useSession()
  const t = useTranslations('wordLists.legacy')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="mt-8 space-y-3" aria-label={t('title')}>
    <h2 className="text-xl">{t('title')}</h2>
    <p>{t('description', { target: session?.user ? session.user.name ?? t('currentAccount') : t('thisBrowser') })}</p>
    <Button disabled={disabled || busy} variant="outline" onClick={async () => {
      setBusy(true)
      setMessage('')
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (!raw) { setMessage(t('none')); return }
        const incoming = await prepareLegacy(decodeLists(raw))
        if (await update(current => mergeLegacy(current, incoming, n => t('suffix', { n })), false)) setMessage(t('done'))
      } catch { setMessage(t('failed')) }
      finally { setBusy(false) }
    }}>{busy ? t('busy') : session?.user ? t('toAccount') : t('toBrowser')}</Button>
    {message && <p role="status">{message}</p>}
  </section>
}
