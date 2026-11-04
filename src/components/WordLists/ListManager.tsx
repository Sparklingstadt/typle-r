"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { CircleAlert, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ListRow from "@/components/WordLists/ListRow"
import EmptyLists from "@/components/WordLists/EmptyLists"
import ListToolbar from "@/components/WordLists/ListToolbar"
import PackFileInput from "@/components/WordLists/PackFileInput"
import PackRow from "@/components/WordLists/PackRow"
import OrphanShares from "@/components/WordLists/OrphanShares"
import ShareDialog from "@/components/WordLists/ShareDialog"
import UnfollowDialog from "@/components/WordLists/UnfollowDialog"
import DeleteListDialog from "@/components/WordLists/DeleteListDialog"
import DeletePackDialog from "@/components/WordLists/DeletePackDialog"
import { useShares } from "@/lib/useShares"
import { useListActions } from "@/lib/useListActions"
import type { Workspace } from "@/lib/useWordLists"
import { isFiltered, listLabels, followedPackCount, matchesFilter, MAX_FOLLOWED_PACKS, MAX_LISTS, NO_FILTER, ownListCount, type ListFilter, type ListOrder, type ListOverview } from "@/core/listOverview"
import { isFollowed } from "@/core/followedPacks"
import { deletePack, loneListPack, matchesPackQuery, packOverviews, sortPacks, visibleListRows, type PackOverview } from "@/core/packEditing"
import type { SavedWordList } from "@/core/wordLists"

export default function ListManager({ lists, packs, saving, highlight, highlightPack, update, updateLibrary, notify, onShowPack, openPacks, onOpenPacksChange, onEdit, onHighlight }: {
  lists: SavedWordList[]
  packs: Workspace['packs']
  saving: boolean
  highlight: string | null
  highlightPack: string | null
  openPacks: Set<string>
  onOpenPacksChange: (value: Set<string>) => void
  update: Workspace['update']
  updateLibrary: Workspace['updateLibrary']
  notify: (message: string) => void
  /** Opens the pack and points at its row. */
  onShowPack: (id: string) => void
  onEdit: (list: SavedWordList) => void
  onHighlight: (id: string) => void
}) {
  const t = useTranslations('wordLists')
  const locale = useLocale()
  const router = useRouter()
  const [now] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<ListOrder>('added')
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [deleting, setDeleting] = useState<{ open: boolean; item: ListOverview | null; position: number }>({ open: false, item: null, position: 0 })
  const [unfollowing, setUnfollowing] = useState<{ id: string; name: string } | null>(null)
  const [deletingPack, setDeletingPack] = useState<{ open: boolean; item: PackOverview | null; position: number }>({ open: false, item: null, position: 0 })
  const { enabled: canShare, shares, orphans, share, stop } = useShares()
  const [sharing, setSharing] = useState<{ id: string; name: string } | null>(null)
  // `lists` are the lists as screens see them (each carries its pack's labels), which is what the overviews are built from.
  const all = useMemo(() => packOverviews({ packs, lists }), [packs, lists])
  const labels = useMemo(() => listLabels(packs, locale), [packs, locale])
  const shown = useMemo(() => sortPacks(all.filter(item => matchesPackQuery(item, query) && matchesFilter(item.pack, filter)), order, locale),
    [all, query, filter, order, locale])
  const narrowed = !!query.trim() || isFiltered(filter)
  // Lists of followed packs are not counted: followed packs have a limit of their own.
  const own = ownListCount({ packs, lists })
  const followed = followedPackCount(packs)
  const full = own >= MAX_LISTS

  const { error: exportError, exportCsv, exportPack, copyPackOf, copyList, importFile } = useListActions({
    packs, lists, update, updateLibrary, notify,
    onPackCreated: id => { setQuery(''); setFilter(NO_FILTER); onShowPack(id) },
    onListCopied: id => { setQuery(''); onHighlight(id) },
  })

  // A list just changed is shown in its pack, which stays open.
  const highlightPackOfList = lists.find(list => list.id === highlight)?.packId
  useEffect(() => {
    if (highlightPackOfList && !openPacks.has(highlightPackOfList)) onOpenPacksChange(new Set([...openPacks, highlightPackOfList]))
  }, [highlightPackOfList, openPacks, onOpenPacksChange])

  // A row's place among the rows shown, which the focus goes back to after it is deleted.
  function rowPosition(id: string) {
    return [...document.querySelectorAll<HTMLElement>('[data-list-id]')].findIndex(row => row.dataset.listId === id)
  }

  // The last list of a pack takes the pack with it.
  const deletingPackName = loneListPack({ packs, lists }, deleting.item?.list.packId)?.name

  // Restoring a pack from a file is the way to start again, so the empty state offers it too.
  if (!lists.length) return <>
    <EmptyLists actions={<PackFileInput disabled={saving} onFile={file => void importFile(file)} />} />
    {exportError && <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{exportError}</p>}
    <OrphanShares orphans={orphans} onStop={stop} focusWhenGone="empty-heading" className="mt-6" />
  </>

  return <section aria-labelledby="list-heading" className="space-y-3">
    <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2">
      <h2 id="list-heading" tabIndex={-1} className="text-base font-bold outline-none">{t('manager.heading')}</h2>
      <Badge variant="secondary" className="tabular-nums" title={t('manager.limitTitle', { max: MAX_LISTS, followedMax: MAX_FOLLOWED_PACKS })}>{t('manager.ownCount', { count: own, max: MAX_LISTS })}</Badge>
      <Badge variant="secondary" className="tabular-nums" title={t('manager.limitTitle', { max: MAX_LISTS, followedMax: MAX_FOLLOWED_PACKS })}>{t('manager.followedCount', { count: followed, max: MAX_FOLLOWED_PACKS })}</Badge>
      <PackFileInput className="ml-auto" disabled={full || saving} onFile={file => void importFile(file)} />
      {/* A pack is made of lists already saved, so only a new list counts towards the limit. */}
      <Button asChild variant="outline"><Link href="/packs/create"><Plus aria-hidden="true" />{t('manager.createPack')}</Link></Button>
      {full ? <Button disabled><Plus aria-hidden="true" />{t('manager.createList')}</Button>
        : <Button asChild><Link href="/create"><Plus aria-hidden="true" />{t('manager.createList')}</Link></Button>}
    </div>
    {full && <p className="text-sm text-muted-foreground">{t('manager.full', { max: MAX_LISTS })}</p>}
    {exportError && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{exportError}</p>}

    <ListToolbar query={query} onQueryChange={setQuery} labels={labels} filter={filter} onFilterChange={setFilter} order={order} onOrderChange={setOrder}
      shownCount={shown.length} totalCount={all.length} narrowed={narrowed} />

    {shown.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {shown.map(item => {
        const { pack } = item
        const followed = isFollowed(pack)
        // A search or filter opens every pack that matched.
        const open = narrowed || openPacks.has(pack.id)
        const rows = visibleListRows(item, query)
        return <PackRow key={pack.id} item={item} now={now} open={open} highlight={highlightPack === pack.id} disabled={saving}
          onToggle={() => {
            const next = new Set(openPacks)
            if (open) next.delete(pack.id)
            else next.add(pack.id)
            onOpenPacksChange(next)
          }}
          onEditPack={() => router.push(`/packs/edit?pack=${encodeURIComponent(pack.id)}`)}
          onAddList={full ? undefined : () => router.push(`/create?pack=${encodeURIComponent(pack.id)}`)}
          onCopy={own + item.lists.length > MAX_LISTS ? undefined : () => copyPackOf(item)} onExport={() => exportPack(item)}
          onShare={canShare ? () => setSharing({ id: pack.id, name: pack.name }) : undefined} shared={shares.has(pack.id)} listed={shares.get(pack.id)?.listed} hidden={shares.get(pack.id)?.hidden}
          onDeletePack={() => setDeletingPack({ open: true, item, position: shown.indexOf(item) })}
          followed={followed} onUnfollow={() => setUnfollowing({ id: pack.id, name: pack.name })}>
          {rows.map(row => <ListRow key={row.list.id} item={row} now={now} highlight={highlight === row.list.id} disabled={saving} canCopy={!full} readOnly={followed}
            onEdit={() => onEdit(row.list)} onExport={() => exportCsv(row.list)} onCopy={() => copyList(row.list)}
            onDelete={() => setDeleting({ open: true, item: row, position: rowPosition(row.list.id) })} />)}
        </PackRow>
      })}
    </ul> : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{query.trim() ? t('manager.noMatch', { query: query.trim() }) : t('filter.noMatch')}</p>
      <Button variant="outline" onClick={() => { setQuery(''); setFilter(NO_FILTER) }}>{isFiltered(filter) ? t('filter.clearAll') : t('manager.clearSearch')}</Button>
    </div>}
    <p className="text-xs text-muted-foreground">{t('manager.csvNote')}</p>
    <OrphanShares orphans={orphans} onStop={stop} focusWhenGone="list-heading" />

    <DeleteListDialog state={deleting} lonePackName={deletingPackName} now={now}
      onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      onExport={exportCsv}
      onDelete={async list => {
        const saved = await update(current => current.filter(item => item.id !== list.id))
        if (saved) notify(t('page.deleted', { name: list.name }))
        return saved
      }} />

    <DeletePackDialog state={deletingPack} shared={!!deletingPack.item && shares.has(deletingPack.item.pack.id)}
      onOpenChange={open => setDeletingPack(current => ({ ...current, open }))}
      onDelete={async pack => {
        const saved = await updateLibrary(current => deletePack(current, pack.id))
        if (saved) notify(t('page.packDeleted', { name: pack.name }))
        return saved
      }} />

    <UnfollowDialog pack={unfollowing} onOpenChange={open => { if (!open) setUnfollowing(null) }} updateLibrary={updateLibrary}
      onUnfollowed={() => {
        setUnfollowing(null)
        // The dialog's row is gone: focus the heading, or the empty state's when no pack is left.
        window.requestAnimationFrame(() => (document.getElementById('list-heading') ?? document.getElementById('empty-heading'))?.focus())
      }} />

    <ShareDialog pack={sharing} hasCategory={!!packs.find(pack => pack.id === sharing?.id)?.category} share={sharing ? shares.get(sharing.id) : undefined} onShare={share} onStop={stop}
      onOpenChange={open => { if (!open) setSharing(null) }} />
  </section>
}
