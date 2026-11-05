"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWordLists } from "@/lib/useWordLists"
import { randomId } from "@/core/randomId"
import { followedPackCount, MAX_FOLLOWED_PACKS } from "@/core/listOverview"
import { followOfficialPack, officialPacks } from "@/plugins/packs/catalog"

// Starts practice on an official pack from its page: follows the pack when it is not followed yet, then opens the
// first list of the visitor's copy on /play. A visitor who follows the pack already goes straight to it.
export default function OfficialPackPractice({ catalogId }: { catalogId: string }) {
  const { ready, packs, lists, saving, updateLibrary } = useWordLists()
  const t = useTranslations("officialPack")
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const owned = packs.find(pack => pack.origin?.catalogId === catalogId)
  const full = !owned && followedPackCount(packs) >= MAX_FOLLOWED_PACKS

  async function start() {
    setBusy(true)
    if (owned) {
      const first = lists.find(list => list.packId === owned.id)
      router.push(first ? `/play?list=${encodeURIComponent(first.id)}` : "/play")
      return
    }
    const entry = officialPacks().find(item => item.catalogId === catalogId)
    const ids = { pack: randomId(), lists: entry ? entry.lists.map(() => randomId()) : [] }
    const saved = entry && await updateLibrary(library => followOfficialPack(library, catalogId, ids))
    if (!saved) { setBusy(false); return }
    router.push(`/play?list=${encodeURIComponent(ids.lists[0])}`)
  }

  return <div className="space-y-2">
    <Button size="lg" disabled={!ready || saving || busy || full} onClick={() => void start()}>
      <Keyboard aria-hidden="true" />{busy ? t("preparing") : t("practice")}
    </Button>
    {full && <p className="text-[13px] text-muted-foreground">{t("full", { max: MAX_FOLLOWED_PACKS })}</p>}
  </div>
}
