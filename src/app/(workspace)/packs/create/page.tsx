"use client"
import { useRef } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import PackEditor from "@/components/PackEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import Notice from "@/components/WordLists/Notice"
import { useWordLists } from "@/lib/useWordLists"
import { ownPacks } from "@/core/followedPacks"
import { createPackFromLists } from "@/core/packEditing"
import { randomId } from "@/core/randomId"

// A pack is made of word lists already saved, which move into it; word lists themselves are made on /create.
export default function CreatePack() {
  const router = useRouter()
  const notify = useSaveNotification()
  const t = useTranslations("wordLists")
  const common = useTranslations("common")
  const { ready, packs, lists, error, errorKey, updateLibrary, storage } = useWordLists()
  // The pack is made once, however many times saving is retried.
  const packId = useRef<string | undefined>(undefined)
  const own = new Set(ownPacks(packs).map(pack => pack.id))
  // The lists of a followed pack belong to the catalog and cannot be moved.
  const choices = lists.filter(list => list.packId !== undefined && own.has(list.packId))

  return <WordListEditorPage>
    {!ready ? <p>{common("loading")}</p>
    : !choices.length ? <Notice link={{ href: "/create", label: t("packEditor.createList") }}>{t("packEditor.noLists")}</Notice>
    : <PackEditor lists={choices} packs={packs} storage={storage} error={error} errorKey={errorKey}
      onCancel={() => router.push("/edit")} onSave={async (fields, listIds) => {
        packId.current ??= randomId()
        const id = packId.current
        const saved = await updateLibrary(library => createPackFromLists(library, fields, listIds, id))
        if (saved) {
          notify(t("packEditor.created", { name: fields.name.trim() }))
          router.push(`/edit?pack=${encodeURIComponent(id)}`)
        }
        return saved
      }} />}
  </WordListEditorPage>
}
