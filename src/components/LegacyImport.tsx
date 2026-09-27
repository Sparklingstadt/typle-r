"use client"
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { decodeLists, STORAGE_KEY, SavedWordList } from '@/lib/wordLists'
import { mergeLegacy, prepareLegacy } from '@/lib/importLegacy'

export default function LegacyImport({ update, disabled }: {
  update: (change: (lists: SavedWordList[]) => SavedWordList[], useDefaults?: boolean) => Promise<boolean>
  disabled: boolean
}) {
  const { data: session } = useSession()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="mt-8 space-y-3" aria-label="以前のデータを移行">
    <h2 className="text-xl">以前のデータを移行</h2>
    <p>このブラウザーに残るv0.1.xの単語リストと記録を、{session?.user ? session.user.name ?? '現在のアカウント' : 'このブラウザー'} に追加します。元のデータは残ります。同じデータを再度移行しても重複しません。</p>
    <Button disabled={disabled || busy} variant="outline" onClick={async () => {
      setBusy(true)
      setMessage('')
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) { setMessage('移行するデータはありません。'); return }
        const incoming = await prepareLegacy(decodeLists(raw))
        if (await update(current => mergeLegacy(current, incoming), false)) setMessage('移行しました。元のデータはこのブラウザーに残しています。')
      } catch { setMessage('保存データを読み込めません。元のデータは変更していません。') }
      finally { setBusy(false) }
    }}>{busy ? '移行中…' : session?.user ? 'このアカウントへ移行する' : 'このブラウザーへ移行する'}</Button>
    {message && <p role="status">{message}</p>}
  </section>
}
