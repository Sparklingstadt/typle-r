"use client"
import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ErrorAlert } from "@/components/ui/alert"
import { ArrowLeft, Copy, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import UnfollowDialog from "@/components/WordLists/UnfollowDialog"
import PackEditor from "@/components/PackEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import { useWordLists } from "@/lib/useWordLists"
import { isFollowed } from "@/core/followedPacks"
import Notice from "@/components/WordLists/Notice"
import { copyPack } from "@/core/packFile"
import { randomId } from "@/core/randomId"
import { MAX_LISTS, ownListCount } from "@/core/listOverview"
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
  const { ready, packs, lists, error, errorKey, updateLibrary, saving, storage } = useWordLists()
  const [unfollowing, setUnfollowing] = useState(false)
  const id = params.get("pack")
  const pack = packs.find(item => item.id === id)
  if (!ready) return <p>{common("loading")}</p>
  const back = id ? `/edit?pack=${encodeURIComponent(id)}` : "/edit"
  if (!pack) return <Notice link={{ href: "/edit", label: t("page.title") }}>{errors("packDeleted")}</Notice>
  // A followed pack has no form: it can be duplicated into a pack of one's own or unfollowed.
  if (isFollowed(pack)) {
    const packId = pack.id
    const mine = lists.filter(list => list.packId === packId).length
    async function copy() {
      const ids = { pack: randomId(), lists: Array.from({ length: mine }, () => randomId()) }
      let name = ""
      const saved = await updateLibrary(library => {
        const next = copyPack(library, packId, ids, n => t("page.copySuffix", { n }))
        name = next.packs.find(item => item.id === ids.pack)?.name ?? ""
        return next
      })
      if (saved) { notify(t("page.created", { name })); router.push(`/edit?pack=${encodeURIComponent(ids.pack)}`) }
    }
    return <section className="space-y-4">
      <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{pack.name}</h1>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <Notice>{errors("packFollowed")}</Notice>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => router.push(back)}><ArrowLeft aria-hidden="true" />{t("catalog.back")}</Button>
        <Button disabled={saving || ownListCount({ packs, lists }) + mine > MAX_LISTS} onClick={() => void copy()}><Copy aria-hidden="true" />{t("pack.copy")}</Button>
        <Button variant="destructive" disabled={saving} onClick={() => setUnfollowing(true)}><UserMinus aria-hidden="true" />{t("follow.unfollow")}</Button>
      </div>
      <UnfollowDialog pack={unfollowing ? pack : null} onOpenChange={open => { if (!open) setUnfollowing(false) }} updateLibrary={updateLibrary}
        onUnfollowed={() => router.push("/edit")} />
    </section>
  }
  return <PackEditor key={pack.id} pack={pack} packs={packs} lists={lists.filter(list => list.packId === pack.id)} storage={storage}
    error={error} errorKey={errorKey} onCancel={() => router.push(back)} onSave={async (fields, listIds) => {
      const saved = await updateLibrary(library => reorderPackLists(updatePack(library, pack.id, fields), pack.id, listIds))
      if (saved) { notify(t("packEditor.updated", { name: fields.name.trim() })); router.push(back) }
      return saved
    }} />
}
