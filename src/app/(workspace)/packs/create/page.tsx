"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import WordListEditor from "@/components/WordListEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import PackFields, { PACK_NAME_FIELD, samePackInput } from "@/components/WordLists/PackFields"
import { useWordLists } from "@/lib/useWordLists"
import { listLabels } from "@/core/listOverview"
import { createPack, type PackInput } from "@/core/packEditing"
import { randomId } from "@/core/randomId"

const emptyPack: PackInput = { name: "", description: "", category: "", tags: [] }

export default function CreatePack() {
  const router = useRouter()
  const notify = useSaveNotification()
  const locale = useLocale()
  const t = useTranslations("wordLists")
  const errors = useTranslations("errors")
  const common = useTranslations("common")
  const { ready, packs, error, errorKey, updateLibrary, storage } = useWordLists()
  const [fields, setFields] = useState(emptyPack)
  // The pack is made once, however many times saving is retried.
  const packId = useRef<string | undefined>(undefined)
  const [failure, setFailure] = useState({ count: 0, name: "" })
  const suggestions = useMemo(() => listLabels(packs, locale), [packs, locale])

  const nameKeyError = errorKey === "packNameRequired" || errorKey === "packNameDuplicate"
  const nameError = nameKeyError && failure.name === fields.name ? errors(errorKey) : undefined
  const handled = useRef(0)
  useEffect(() => {
    if (failure.count <= handled.current) return
    handled.current = failure.count
    if (nameKeyError) document.querySelector<HTMLElement>(`input[name="${PACK_NAME_FIELD}"]`)?.focus()
  }, [failure, nameKeyError])

  return <WordListEditorPage>
    {ready ? <WordListEditor title={t("packEditor.createTitle")} description={t("packEditor.createDescription")} storage={storage}
      error={error} errorKey={errorKey} packDirty={!samePackInput(fields, emptyPack)}
      packFields={<PackFields value={fields} onChange={setFields} suggestions={suggestions} nameError={nameError} />}
      onCancel={() => router.push("/edit")} onSave={async list => {
        packId.current ??= randomId()
        const id = packId.current
        const saved = await updateLibrary(library => createPack(library, fields, list, id))
        if (saved) {
          notify(t("packEditor.created", { name: fields.name.trim() }))
          router.push(`/edit?pack=${encodeURIComponent(id)}`)
        } else setFailure(current => ({ count: current.count + 1, name: fields.name }))
        return saved
      }} /> : <p>{common("loading")}</p>}
  </WordListEditorPage>
}
