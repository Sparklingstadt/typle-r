"use client"
import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, CircleAlert, Copy, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import UnfollowDialog from "@/components/WordLists/UnfollowDialog"
import PackEditor from "@/components/PackEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import { useWordLists } from "@/lib/useWordLists"
import { isFollowed } from "@/core/followedPacks"
import { copyPack } from "@/core/packFile"
import { randomId } from "@/core/randomId"
import { MAX_LISTS } from "@/core/listOverview"
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
  if (!pack) return <Alert>
    <CircleAlert aria-hidden="true" />
    <AlertDescription className="flex flex-wrap items-center gap-x-3">
      <span>{errors("packDeleted")}</span>
      <Link href="/edit" className="underline underline-offset-4">{t("page.title")}</Link>
    </AlertDescription>
  </Alert>
  // A followed pack has no form: it can be duplicated into a pack of one's own or unfollowed.
  if (isFollowed(pack)) {
    const mine = lists.filter(list => list.packId === pack.id).length
    async function copy() {
      const ids = { pack: randomId(), lists: Array.from({ length: mine }, () => randomId()) }
      let name = ""
      const saved = await updateLibrary(library => {
        const next = copyPack(library, pack!.id, ids, n => t("page.copySuffix", { n }))
        name = next.packs.find(item => item.id === ids.pack)?.name ?? ""
        return next
      })
      if (saved) { notify(t("page.created", { name })); router.push(`/edit?pack=${encodeURIComponent(ids.pack)}`) }
    }
    return <section className="space-y-4">
      <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{pack.name}</h1>
      {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription></Alert>}
      <Alert>
        <CircleAlert aria-hidden="true" />
        <AlertDescription>{errors("packFollowed")}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => router.push(back)}><ArrowLeft aria-hidden="true" />{t("catalog.back")}</Button>
        <Button disabled={saving || lists.length + mine > MAX_LISTS} onClick={() => void copy()}><Copy aria-hidden="true" />{t("pack.copy")}</Button>
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
