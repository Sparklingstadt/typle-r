"use client"
import { useTranslations } from "next-intl"
import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWordLists } from "@/lib/useWordLists"
import { useOfficialPackStart } from "@/lib/useOfficialPackStart"
import { followedPackCount, MAX_FOLLOWED_PACKS } from "@/core/listOverview"

// The practice button of an official pack's page (see useOfficialPackStart).
export default function OfficialPackPractice({ catalogId }: { catalogId: string }) {
  const { ready, packs, saving } = useWordLists()
  const { start, starting } = useOfficialPackStart()
  const t = useTranslations("officialPack")
  const owned = packs.some(pack => pack.origin?.catalogId === catalogId)
  const full = !owned && followedPackCount(packs) >= MAX_FOLLOWED_PACKS

  return <div className="space-y-2">
    <Button size="lg" disabled={!ready || saving || starting !== null || full} onClick={() => void start(catalogId)}>
      <Keyboard aria-hidden="true" />{starting ? t("preparing") : t("practice")}
    </Button>
    {full && <p className="text-[13px] text-muted-foreground">{t("full", { max: MAX_FOLLOWED_PACKS })}</p>}
  </div>
}
