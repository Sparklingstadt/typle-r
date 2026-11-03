"use client"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import WordListEditor from "@/components/WordListEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import { useWordLists } from "@/lib/useWordLists"
import { ownPacks } from "@/core/followedPacks"
import { saveListInPack } from "@/core/packEditing"

export default function Create() {
  const common = useTranslations('common')
  return <WordListEditorPage>
    <Suspense fallback={<p>{common('loading')}</p>}><Editor /></Suspense>
  </WordListEditorPage>
}

// A word list is made on its own: no pack is chosen here, and the list gets a pack of its own (packs are put together on
// /packs/create). `/create?pack=<id>`, a pack's 「リストを追加」, adds the list to that pack instead while it still exists.
function Editor() {
  const router = useRouter()
  const params = useSearchParams()
  const notify = useSaveNotification()
  const t = useTranslations('wordLists')
  const common = useTranslations('common')
  const { ready, packs, error, errorKey, updateLibrary, storage } = useWordLists()
  if (!ready) return <p>{common('loading')}</p>
  // A followed pack takes no new lists, so it is not offered and `?pack=` naming one starts a pack of its own.
  return <WordListEditor title={t('page.createTitle')} storage={storage} packs={ownPacks(packs)} packId={params.get('pack')} choosePack={false} error={error} errorKey={errorKey}
    onCancel={() => router.push('/edit')} onSave={async (list, packId) => {
      // The pack of a list that starts a pack is made while saving, so its id is read from the result.
      let target = packId
      const saved = await updateLibrary(library => {
        const next = saveListInPack(library, { id: list.id, name: list.name, words: list.words, levels: list.levels, ...(list.writing ? { writing: list.writing } : {}), createdAt: list.createdAt }, packId, false)
        target = next.lists.find(item => item.id === list.id)?.packId ?? packId
        return next
      })
      if (saved) {
        notify(t('page.created', { name: list.name.trim() }))
        router.push(target ? `/edit?pack=${encodeURIComponent(target)}` : '/edit')
      }
      return saved
    }} />
}
