"use client"
import { Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CircleAlert } from "lucide-react"
import PackEditor from "@/components/PackEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import { useWordLists } from "@/lib/useWordLists"
import { reorderPackLists, updatePack } from "@/core/packEditing"

export default function EditPack() {
  const common = useTranslations("common")
  return <WordListEditorPage>
    <Suspense fallback={<p>{common("loading")}</p>}><Editor /></Suspense>
  </WordListEditorPage>
}

function Editor() {
  const router = useRouter()
  const params = useSearchParams()
  const notify = useSaveNotification()
  const t = useTranslations("wordLists")
  const errors = useTranslations("errors")
  const common = useTranslations("common")
  const { ready, packs, lists, error, errorKey, updateLibrary, storage } = useWordLists()
  const id = params.get("pack")
  const pack = packs.find(item => item.id === id)
  if (!ready) return <p>{common("loading")}</p>
  const back = id ? `/edit?pack=${encodeURIComponent(id)}` : "/edit"
  if (!pack) return <Alert>
    <CircleAlert aria-hidden="true" />
    <AlertDescription className="flex flex-wrap items-center gap-x-3">
      <span>{errors("packDeleted")}</span>
      <Link href="/edit" className="underline underline-offset-4">{t("page.title")}</Link>
    </AlertDescription>
  </Alert>
  return <PackEditor key={pack.id} pack={pack} packs={packs} lists={lists.filter(list => list.packId === pack.id)} storage={storage}
    error={error} errorKey={errorKey} onCancel={() => router.push(back)} onSave={async (fields, listIds) => {
      const saved = await updateLibrary(library => reorderPackLists(updatePack(library, pack.id, fields), pack.id, listIds))
      if (saved) { notify(t("packEditor.updated", { name: fields.name.trim() })); router.push(back) }
      return saved
    }} />
}
