"use client"
import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowLeft, Check, CircleAlert, Plus, SquareArrowOutUpRight } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSaveNotification } from "@/components/SaveNotification"
import ListLabels from "@/components/WordLists/ListLabels"
import PageStorageBadge from "@/components/PageStorageBadge"
import { useWordLists } from "@/lib/useWordLists"
import { randomId } from "@/core/randomId"
import { MAX_LISTS } from "@/core/listOverview"
import { followOfficialPack, catalogEntries, type CatalogEntry } from "@/plugins/packs/catalog"

export default function Catalog() {
  const { ready, packs, lists, error, updateLibrary, saving, storage } = useWordLists()
  const t = useTranslations("wordLists.catalog")
  const row = useTranslations("wordLists.pack")
  const common = useTranslations("common")
  const router = useRouter()
  const notify = useSaveNotification()
  const entries = useMemo(() => catalogEntries({ packs, lists }), [packs, lists])

  // The pack that came from an entry: the one with its origin, or the one with its id (see catalogEntries).
  function ownedPack(entry: CatalogEntry) {
    return packs.find(pack => pack.origin?.catalogId === entry.catalogId) ?? packs.find(pack => pack.id === entry.catalogId)
  }

  async function add(entry: CatalogEntry) {
    const ids = { pack: randomId(), lists: entry.lists.map(() => randomId()) }
    let name = ""
    const saved = await updateLibrary(library => {
      const next = followOfficialPack(library, entry.catalogId, ids)
      name = next.packs.find(pack => pack.id === ids.pack)?.name ?? entry.pack.name
      return next
    })
    if (saved) {
      notify(t("added", { name }))
      router.push(`/edit?pack=${encodeURIComponent(ids.pack)}`)
    }
  }

  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    {!ready ? <div role="status">
      <span className="sr-only">{common("loading")}</span>
      <div className="mb-6 space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2].map(key => <div key={key} className="space-y-2 px-5 py-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-3.5 w-72 max-w-full" /></div>)}
      </div>
    </div> : <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <PageStorageBadge storage={storage} />
      </header>
      <Button asChild variant="ghost" className="mb-3 -ml-2 text-muted-foreground"><Link href="/edit"><ArrowLeft aria-hidden="true" />{t("back")}</Link></Button>
      {error && <Alert variant="destructive" className="mb-4 border-destructive/40 bg-destructive/5">
        <CircleAlert aria-hidden="true" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {entries.map(entry => {
          const owned = entry.followed ? ownedPack(entry) : undefined
          const words = entry.lists.reduce((sum, list) => sum + list.words.length, 0)
          const full = lists.length + entry.lists.length > MAX_LISTS
          return <li key={entry.catalogId} data-catalog-id={entry.catalogId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
            <div className="min-w-0 flex-1 basis-64 space-y-1.5">
              <h2 className="font-bold [overflow-wrap:anywhere]">{entry.pack.name}</h2>
              <ListLabels list={entry.pack} />
              <p className="text-[13px] text-muted-foreground tabular-nums">{row("lists", { count: entry.lists.length })} · {row("wordCount", { count: words })}</p>
              {!entry.followed && full && <p className="text-[13px] text-muted-foreground">{t("full", { max: MAX_LISTS })}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {owned && <Button asChild variant="outline"><Link href={`/edit?pack=${encodeURIComponent(owned.id)}`}>
                <SquareArrowOutUpRight aria-hidden="true" />{t("open")}<span className="sr-only"> {entry.pack.name}</span>
              </Link></Button>}
              {entry.followed ? <Button disabled><Check aria-hidden="true" />{t("addedState")}</Button>
                : <Button disabled={full || saving} aria-label={t("addPack", { name: entry.pack.name })} onClick={() => void add(entry)}>
                  <Plus aria-hidden="true" />{t("add")}
                </Button>}
            </div>
          </li>
        })}
      </ul>
    </>}
  </main>
}
