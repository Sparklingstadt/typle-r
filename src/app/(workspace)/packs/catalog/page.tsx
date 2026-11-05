"use client"
import { useMemo, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowLeft, Check, Plus, SquareArrowOutUpRight, UserMinus } from "lucide-react"
import { ErrorAlert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyNote } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useSaveNotification } from "@/components/SaveNotification"
import ListLabels from "@/components/WordLists/ListLabels"
import UnfollowDialog from "@/components/WordLists/UnfollowDialog"
import PageStorageBadge from "@/components/PageStorageBadge"
import { useWordLists } from "@/lib/useWordLists"
import { randomId } from "@/core/randomId"
import { followedPackCount, MAX_FOLLOWED_PACKS } from "@/core/listOverview"
import { matchesInterests } from "@/core/interests"
import { followOfficialPack, catalogEntries, type CatalogEntry } from "@/plugins/packs/catalog"
import { PageHeader, PageMain } from "@/components/ui/page-layout"
import { CardList } from "@/components/ui/card"

export default function Catalog() {
  const { ready, packs, lists, interests, error, updateLibrary, saving, storage } = useWordLists()
  const t = useTranslations("wordLists.catalog")
  const row = useTranslations("wordLists.pack")
  const unfollow = useTranslations("wordLists.follow")
  const common = useTranslations("common")
  const notify = useSaveNotification()
  const [unfollowing, setUnfollowing] = useState<{ id: string; name: string } | null>(null)
  const entries = useMemo(() => catalogEntries({ packs, lists }), [packs, lists])
  // Following takes one of the followed packs, not lists: their lists are not counted in MAX_LISTS.
  const full = followedPackCount(packs) >= MAX_FOLLOWED_PACKS
  // Following stays on the catalog, so that more packs can be followed one after another. The follow button gives way
  // to 「フォロー中」, so the focus moves to the new pack's 「開く」 link instead of being lost.
  const [followedNow, setFollowedNow] = useState<string | null>(null)

  // With interests, the entries that match come first in a section of their own; each keeps its place in the catalog order.
  const [matching, others] = useMemo(() => {
    const fits: CatalogEntry[] = []
    const rest: CatalogEntry[] = []
    for (const entry of entries) (matchesInterests(entry.pack, interests) ? fits : rest).push(entry)
    return [fits, rest]
  }, [entries, interests])
  const split = interests.length > 0

  // The pack that came from an entry: the one with its origin, or the one with its id (see catalogEntries).
  function ownedPack(entry: CatalogEntry) {
    return packs.find(pack => pack.origin?.catalogId === entry.catalogId) ?? packs.find(pack => pack.id === entry.catalogId)
  }

  async function follow(entry: CatalogEntry) {
    const ids = { pack: randomId(), lists: entry.lists.map(() => randomId()) }
    let name = ""
    const saved = await updateLibrary(library => {
      const next = followOfficialPack(library, entry.catalogId, ids)
      name = next.packs.find(pack => pack.id === ids.pack)?.name ?? entry.pack.name
      return next
    })
    if (saved) {
      notify(t("followed", { name }))
      setFollowedNow(entry.catalogId)
    }
  }

  // Entries sit under a section heading once the catalog is split, so their names step down a level.
  const renderEntries = (items: CatalogEntry[], Name: "h2" | "h3") => (
    <CardList>
      {items.map(entry => {
        const owned = entry.followed ? ownedPack(entry) : undefined
        const words = entry.lists.reduce((sum, list) => sum + list.words.length, 0)
        return <li key={entry.catalogId} data-catalog-id={entry.catalogId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
          <div className="min-w-0 flex-1 basis-64 space-y-1.5">
            <Name className="font-bold [overflow-wrap:anywhere]">{entry.pack.name}</Name>
            <ListLabels list={entry.pack} />
            <p className="text-[13px] text-muted-foreground tabular-nums">{row("lists", { count: entry.lists.length })} · {row("wordCount", { count: words })}</p>
            {!entry.followed && full && <p className="text-[13px] text-muted-foreground">{t("full", { max: MAX_FOLLOWED_PACKS })}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {owned && <Button asChild variant="outline"><Link href={`/edit?pack=${encodeURIComponent(owned.id)}`}
              ref={entry.catalogId === followedNow ? link => link?.focus() : undefined} onBlur={() => setFollowedNow(null)}>
              <SquareArrowOutUpRight aria-hidden="true" />{t("open")}<span className="sr-only"> {entry.pack.name}</span>
            </Link></Button>}
            {entry.followed ? <>
              <Button disabled><Check aria-hidden="true" />{t("following")}</Button>
              {owned && <Button variant="outline" disabled={saving} aria-label={t("unfollowPack", { name: entry.pack.name })} onClick={() => setUnfollowing({ id: owned.id, name: owned.name })}>
                <UserMinus aria-hidden="true" />{unfollow("unfollow")}
              </Button>}
            </> : <Button disabled={full || saving} aria-label={t("followPack", { name: entry.pack.name })} onClick={() => void follow(entry)}>
              <Plus aria-hidden="true" />{t("follow")}
            </Button>}
          </div>
        </li>
      })}
    </CardList>
  )

  return <PageMain width="medium">
    {!ready ? <div role="status">
      <span className="sr-only">{common("loading")}</span>
      <div className="mb-6 space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2].map(key => <div key={key} className="space-y-2 px-5 py-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-3.5 w-72 max-w-full" /></div>)}
      </div>
    </div> : <>
      <PageHeader title={t("title")} description={t("description")}>
        <PageStorageBadge storage={storage} />
      </PageHeader>
      <Button asChild variant="ghost" className="mb-3 -ml-2 text-muted-foreground"><Link href="/edit"><ArrowLeft aria-hidden="true" />{t("back")}</Link></Button>
      {error && <ErrorAlert className="mb-4">{error}</ErrorAlert>}
      {!split ? renderEntries(entries, "h2") : <div className="space-y-8">
        <section aria-labelledby="catalog-matching" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="catalog-matching" className="text-base font-bold">{t("matching")}</h2>
            <Link href="/interests" className="text-sm underline underline-offset-3 hover:text-foreground">{t("changeInterests")}</Link>
          </div>
          {matching.length ? renderEntries(matching, "h3") : <EmptyNote>{t("noMatching")}</EmptyNote>}
        </section>
        {others.length > 0 && <section aria-labelledby="catalog-others" className="space-y-3">
          <h2 id="catalog-others" className="text-base font-bold">{t("others")}</h2>
          {renderEntries(others, "h3")}
        </section>}
      </div>}
      <p className="mt-8 text-sm"><Link href="/gallery" className="underline underline-offset-3 hover:text-foreground">{t("toGallery")}</Link></p>
      <UnfollowDialog pack={unfollowing} onOpenChange={open => { if (!open) setUnfollowing(null) }} updateLibrary={updateLibrary} onUnfollowed={() => setUnfollowing(null)} />
    </>}
  </PageMain>
}
