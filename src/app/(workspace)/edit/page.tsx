"use client"
import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { DropdownMenu } from "radix-ui"
import { Check, ChevronDown, CircleAlert, Download, Library as LibraryIcon, ListPlus, Plus, Upload, RotateCw, Search, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useSaveNotification } from "@/components/SaveNotification"
import WordListEditor from "@/components/WordListEditor"
import { downloadPackFile, downloadWordCsv } from "@/components/WordListExport"
import ListRow, { usePracticeText } from "@/components/WordLists/ListRow"
import LabelFilter from "@/components/WordLists/LabelFilter"
import PackRow from "@/components/WordLists/PackRow"
import OrphanShares from "@/components/WordLists/OrphanShares"
import ShareDialog from "@/components/WordLists/ShareDialog"
import UnfollowDialog from "@/components/WordLists/UnfollowDialog"
import { useShares } from "@/lib/useShares"
import { useWordLists } from "@/lib/useWordLists"
import { useErrorText } from "@/i18n/useErrorText"
import { AppError } from "@/core/appError"
import { MAX_IMPORT_BYTES } from "@/core/wordFormat"
import { copyPack, decodePackFile, encodePackFile, importPackFile } from "@/core/packFile"
import { useFormat } from "@/i18n/useFormat"
import { randomId } from "@/core/randomId"
import { duplicateList, isFiltered, LIST_ORDERS, listLabels, followedPackCount, listOverviews, matchesFilter, MAX_FOLLOWED_PACKS, MAX_LISTS, NO_FILTER, ownListCount, type ListFilter, type ListOrder, type ListOverview } from "@/core/listOverview"
import { isFollowed, ownPacks } from "@/core/followedPacks"
import Notice from "@/components/WordLists/Notice"
import { deletePack, matchesPackQuery, matchingListIds, packOverviews, saveListInPack, type PackOverview } from "@/core/packEditing"
import type { SavedWordList } from "@/core/wordLists"
import type { Library } from "@/core/wordPacks"
import PageStorageBadge from "@/components/PageStorageBadge"
import type { WorkspaceLocation } from "@/core/workspaceStore"

type Workspace = ReturnType<typeof useWordLists>

export default function Edit() {
  const workspace = useWordLists()
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    {!workspace.ready ? <LoadingState />
      : <Suspense fallback={<LoadingState />}><WordLists key={workspace.accountId} workspace={workspace} /></Suspense>}
  </main>
}

function Header({ storage }: { storage?: WorkspaceLocation }) {
  const t = useTranslations('wordLists.page')
  return <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div className="space-y-1">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
    <div className="flex items-center gap-2">
      <Button asChild variant="outline"><Link href="/packs/catalog"><LibraryIcon aria-hidden="true" />{t('catalog')}</Link></Button>
      <PageStorageBadge storage={storage} />
    </div>
  </header>
}

function LoadingState() {
  const common = useTranslations('common')
  return <div role="status">
    <span className="sr-only">{common('loading')}</span>
    <div className="mb-6 space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-96 max-w-full" /></div>
    <Skeleton className="mb-3 h-11 w-full" />
    <div className="divide-y rounded-xl border bg-card">
      {[0, 1, 2, 3].map(key => <div key={key} className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3.5 w-72 max-w-full" /></div>
        <Skeleton className="hidden h-8 w-36 sm:block" /><Skeleton className="size-10" />
      </div>)}
    </div>
  </div>
}

// `/edit?list=<id>` opens the editor, so other screens can link to it and the browser's back button returns to the lists.
// The editor stays open while it has unsaved changes: going back asks first, like キャンセル.
function WordLists({ workspace }: { workspace: Workspace }) {
  const { lists, packs, error, errorKey, saving, update, updateLibrary, storage } = workspace
  const t = useTranslations('wordLists.page')
  const errors = useTranslations('errors')
  const practiceText = usePracticeText()
  const notify = useSaveNotification()
  const params = useSearchParams()
  const urlId = params.get('list')
  const [openId, setOpenId] = useState(urlId)
  const [seenUrl, setSeenUrl] = useState(urlId)
  const [dirty, setDirty] = useState(false)
  const [cancelRequest, setCancelRequest] = useState(0)
  const [highlight, setHighlight] = useState<string | null>(null)
  // `/edit?pack=<id>` (from the pack screens, after saving) opens that pack and points at its row.
  const packId = params.get('pack')
  const [seenPack, setSeenPack] = useState<string | null>(null)
  const [highlightPack, setHighlightPack] = useState<string | null>(null)
  // The open packs stay open while a list is edited, so the row is there to return to.
  const [openPacks, setOpenPacks] = useState<Set<string>>(() => new Set())
  if (packId !== seenPack) {
    setSeenPack(packId)
    if (packId) {
      setHighlightPack(packId)
      setOpenPacks(current => new Set([...current, packId]))
    }
  }
  const pushed = useRef(false)
  const returnTo = useRef<{ id: string; scroll: number } | null>(null)
  const editing = lists.find(list => list.id === openId)

  // Follow the URL (back/forward, the sidebar link), unless that would drop unsaved changes.
  if (urlId !== seenUrl) {
    setSeenUrl(urlId)
    if (openId && urlId !== openId && dirty) setCancelRequest(count => count + 1)
    else setOpenId(urlId)
  }
  // Put the editor's URL back once per request, so the confirmation is answered on the editor.
  const restored = useRef(0)
  useEffect(() => {
    if (cancelRequest === restored.current) return
    restored.current = cancelRequest
    if (!openId || urlId === openId) return
    pushed.current = true
    window.history.pushState(null, '', `/edit?list=${encodeURIComponent(openId)}`)
  }, [cancelRequest, openId, urlId])

  // Back on the lists: where the editor was opened from, with the row that was changed in view.
  useEffect(() => {
    if (openId) return
    pushed.current = false
    const target = returnTo.current
    returnTo.current = null
    if (!target) return
    window.scrollTo({ top: target.scroll })
    document.querySelector<HTMLElement>(`[data-list-id="${CSS.escape(target.id)}"] [data-edit]`)?.focus({ preventScroll: true })
  }, [openId])
  useEffect(() => {
    if (!highlight) return
    document.querySelector(`[data-list-id="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'nearest' })
    const timer = window.setTimeout(() => setHighlight(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlight])
  useEffect(() => {
    if (!highlightPack || openId) return
    document.querySelector(`[data-pack-id="${CSS.escape(highlightPack)}"]`)?.scrollIntoView({ block: 'nearest' })
    const timer = window.setTimeout(() => setHighlightPack(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlightPack, openId])

  function open(list: SavedWordList) {
    returnTo.current = { id: list.id, scroll: window.scrollY }
    pushed.current = true
    setDirty(false)
    setOpenId(list.id)
    window.history.pushState(null, '', `/edit?list=${encodeURIComponent(list.id)}`)
    window.scrollTo({ top: 0 })
  }

  function close(saved?: string) {
    const id = openId
    returnTo.current ??= id ? { id, scroll: 0 } : null
    setDirty(false)
    setOpenId(null)
    if (saved) setHighlight(saved)
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else window.history.replaceState(null, '', '/edit')
  }

  const trackDirty = useCallback((value: boolean) => setDirty(value), [])

  // Moving the only list of a pack to another pack deletes that pack, which the editor says when another pack is chosen.
  const lonePack = editing && lists.filter(list => list.packId === editing.packId).length === 1 ? packs.find(pack => pack.id === editing.packId) : undefined
  const editingPack = editing ? packs.find(pack => pack.id === editing.packId) : undefined
  // The lists of a followed pack are not edited: the notice replaces the editor, with the way back.
  if (openId && editing && editingPack && isFollowed(editingPack)) {
    return <Notice link={{ href: `/edit?pack=${encodeURIComponent(editingPack.id)}`, label: t('title') }}>{errors('packFollowed')}</Notice>
  }
  if (openId && editing) return <WordListEditor key={editing.id} title={t('editTitle')} initial={editing} packs={ownPacks(packs)} packId={editing.packId ?? null} error={error} errorKey={errorKey}
    lonePackName={lonePack?.name}
    description={t('editDescription', { count: editing.words.length, practice: practiceText(listOverviews([editing])[0], new Date()) })}
    storage={storage} onDirtyChange={trackDirty} cancelRequest={cancelRequest}
    onCancel={() => close()} onSave={async (list, packId) => {
      let target = packId
      const saved = await updateLibrary(library => {
        const next = saveListInPack(library, { id: list.id, name: list.name, words: list.words, levels: list.levels, ...(list.writing ? { writing: list.writing } : {}), createdAt: list.createdAt }, packId, true)
        target = next.lists.find(item => item.id === list.id)?.packId ?? packId
        return next
      })
      if (saved) {
        // The list's pack, possibly a new one, is opened so the row is there to return to.
        if (target) setOpenPacks(current => new Set([...current, target!]))
        close(list.id)
        notify(t('updated', { name: list.name.trim() }))
      }
      return saved
    }} />

  return <>
    <Header storage={storage} />
    {error && <Alert variant="destructive" className="mb-6 border-destructive/40 bg-destructive/5">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-64">{error}</span>
        <Button variant="outline" size="lg" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" />{t('reload')}</Button>
      </AlertDescription>
    </Alert>}
    {openId && !editing && <Alert className="mb-6">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{t('notFound')}</AlertDescription>
    </Alert>}
    {/* After a failed load the lists are unknown; "no lists yet" would be wrong. */}
    {!(error && !lists.length) && <ListManager lists={lists} packs={packs} saving={saving} highlight={highlight} highlightPack={highlightPack}
      update={update} updateLibrary={updateLibrary} notify={notify}
      onShowPack={id => { setHighlightPack(id); setOpenPacks(current => new Set([...current, id])) }}
      openPacks={openPacks} onOpenPacksChange={setOpenPacks} onEdit={open} onHighlight={setHighlight} />}
  </>
}

// Newest first for 'added'. Packs without a record come after the practised ones for 'practiced'.
function sortPacks(items: PackOverview[], order: ListOrder, locale: string) {
  const collator = new Intl.Collator(locale, { numeric: true })
  return [...items].sort((a, b) => {
    if (order === 'name') return collator.compare(a.pack.name, b.pack.name) || b.position - a.position
    if (order === 'words') return b.wordCount - a.wordCount || b.position - a.position
    if (order === 'practiced') return (b.lastPracticed ?? -Infinity) - (a.lastPracticed ?? -Infinity) || b.position - a.position
    return b.position - a.position
  })
}

function ListManager({ lists, packs, saving, highlight, highlightPack, update, updateLibrary, notify, onShowPack, openPacks, onOpenPacksChange, onEdit, onHighlight }: {
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
  const errorText = useErrorText()
  const fileInput = useRef<HTMLInputElement>(null)
  const [now] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<ListOrder>('added')
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [exportError, setExportError] = useState('')
  const [deleting, setDeleting] = useState<{ open: boolean; item: ListOverview | null; position: number }>({ open: false, item: null, position: 0 })
  const [unfollowing, setUnfollowing] = useState<{ id: string; name: string } | null>(null)
  const [deletingPack, setDeletingPack] = useState<{ open: boolean; item: PackOverview | null; position: number }>({ open: false, item: null, position: 0 })
  const { enabled: canShare, shares, orphans, share, stop } = useShares()
  const [sharing, setSharing] = useState<{ id: string; name: string } | null>(null)
  const deleted = useRef(false)
  const packDeleted = useRef(false)
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

  function exportCsv(list: SavedWordList) {
    setExportError(downloadWordCsv(list) ? '' : t('page.exportFailed', { name: list.name }))
  }

  function exportPack(item: PackOverview) {
    const library = { packs, lists }
    setExportError(downloadPackFile(item.pack.name, encodePackFile(library, item.pack.id)) ? '' : t('page.exportFailed', { name: item.pack.name }))
  }

  // The new pack is the one the change added; its name is read back from the saved library.
  async function savePack(change: (library: Library, ids: { pack: string; lists: string[] }) => Library, listCount: number,
    ids = { pack: randomId(), lists: Array.from({ length: listCount }, () => randomId()) }) {
    let name = ''
    const saved = await updateLibrary(library => {
      const next = change(library, ids)
      name = next.packs.find(pack => pack.id === ids.pack)?.name ?? ''
      return next
    })
    if (saved) {
      // Clear the search so the new pack is in view, then open it.
      setQuery('')
      setFilter(NO_FILTER)
      onShowPack(ids.pack)
      notify(t('page.created', { name }))
    }
  }

  function copyPackOf(item: PackOverview) {
    return savePack((library, ids) => copyPack(library, item.pack.id, ids, n => t('page.copySuffix', { n })), item.lists.length)
  }

  // A file that cannot be read, or is too large, is refused here and nothing is saved.
  async function importFile(file: File) {
    setExportError('')
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new AppError('importTooLarge')
      const decoded = decodePackFile(await file.text())
      // A file that breaks a save rule is refused here too, on this line, with nothing saved. The screens' lists carry
      // their pack's labels, which a library in the saved shape does not.
      const ids = { pack: randomId(), lists: decoded.lists.map(() => randomId()) }
      importPackFile({ packs, lists: lists.map(({ group: _group, category: _category, tags: _tags, ...rest }) => rest) }, decoded, ids)
      await savePack((library, same) => importPackFile(library, decoded, same), decoded.lists.length, ids)
    } catch (reason) {
      setExportError(errorText(reason, t('import.readFailed')))
    }
  }

  async function copy(list: SavedWordList) {
    const copyId = randomId()
    let name = ''
    const saved = await update(current => {
      const result = duplicateList(current, list.id, copyId, n => t('page.copySuffix', { n }))
      name = result.copy.name
      return result.lists
    })
    if (saved) {
      // Clear the search so the copy is in view, then point at it.
      setQuery('')
      onHighlight(copyId)
      notify(t('page.created', { name }))
    }
  }

  // A list just changed is shown in its pack, which stays open.
  const highlightPackOfList = lists.find(list => list.id === highlight)?.packId
  useEffect(() => {
    if (highlightPackOfList && !openPacks.has(highlightPackOfList)) onOpenPacksChange(new Set([...openPacks, highlightPackOfList]))
  }, [highlightPackOfList, openPacks, onOpenPacksChange])

  // A row's place among the rows shown, which the focus goes back to after it is deleted.
  function rowPosition(id: string) {
    return [...document.querySelectorAll<HTMLElement>('[data-list-id]')].findIndex(row => row.dataset.listId === id)
  }

  // After a deletion, focus the row that took the removed row's place so the next list can be handled too.
  function focusAfterDelete(event: Event) {
    event.preventDefault()
    const buttons = document.querySelectorAll<HTMLElement>('[data-list-id] [data-edit]')
    const target = deleted.current ? buttons[Math.min(deleting.position, buttons.length - 1)] : buttons[deleting.position]
    if (target) target.focus()
    else document.getElementById('list-heading')?.focus()
  }

  // After a pack is deleted, focus the pack that took its place, or the heading when none is left.
  function focusAfterDeletePack(event: Event) {
    event.preventDefault()
    const buttons = document.querySelectorAll<HTMLElement>('[data-pack-id] h3 button')
    const target = packDeleted.current ? buttons[Math.min(deletingPack.position, buttons.length - 1)] : buttons[deletingPack.position]
    if (target) target.focus()
    else document.getElementById('list-heading')?.focus()
  }

  // The last list of a pack takes the pack with it.
  const deletingPackName = deleting.item && lists.filter(list => list.packId === deleting.item!.list.packId).length === 1
    ? packs.find(pack => pack.id === deleting.item!.list.packId)?.name : undefined

  // Restoring a pack from a file is the way to start again, so the empty state offers it too.
  if (!lists.length) return <>
    <EmptyState actions={<>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden tabIndex={-1} aria-hidden="true"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
      <Button variant="outline" disabled={saving} onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" />{t('manager.importFile')}</Button>
    </>} />
    {exportError && <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{exportError}</p>}
    <OrphanShares orphans={orphans} onStop={stop} focusWhenGone="empty-heading" className="mt-6" />
  </>

  return <section aria-labelledby="list-heading" className="space-y-3">
    <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2">
      <h2 id="list-heading" tabIndex={-1} className="text-base font-bold outline-none">{t('manager.heading')}</h2>
      <Badge variant="secondary" className="tabular-nums" title={t('manager.limitTitle', { max: MAX_LISTS, followedMax: MAX_FOLLOWED_PACKS })}>{t('manager.ownCount', { count: own, max: MAX_LISTS })}</Badge>
      <Badge variant="secondary" className="tabular-nums" title={t('manager.limitTitle', { max: MAX_LISTS, followedMax: MAX_FOLLOWED_PACKS })}>{t('manager.followedCount', { count: followed, max: MAX_FOLLOWED_PACKS })}</Badge>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden tabIndex={-1} aria-hidden="true"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
      <Button variant="outline" className="ml-auto" disabled={full || saving} onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" />{t('manager.importFile')}</Button>
      {full ? <Button disabled><Plus aria-hidden="true" />{t('manager.createPack')}</Button>
        : <Button asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('manager.createPack')}</Link></Button>}
    </div>
    {full && <p className="text-sm text-muted-foreground">{t('manager.full', { max: MAX_LISTS })}</p>}
    {exportError && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{exportError}</p>}

    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
        <span className="sr-only">{t('manager.search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('manager.search')}
          className="h-10 w-full rounded-lg border border-input bg-background pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden" />
        {query && <button type="button" aria-label={t('manager.clearSearch')} onClick={() => setQuery('')}
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          <X className="size-3.5" aria-hidden="true" />
        </button>}
      </label>
      <LabelFilter labels={labels} value={filter} onChange={setFilter} />
      <OrderMenu value={order} onChange={setOrder} />
      {isFiltered(filter) && <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => setFilter(NO_FILTER)}>{t('filter.clear')}</Button>}
      <p aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums">{narrowed ? t('manager.countFiltered', { shown: shown.length, total: all.length }) : t('manager.count', { total: all.length })}</p>
    </div>

    {shown.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {shown.map(item => {
        const { pack } = item
        const followed = isFollowed(pack)
        // A search or filter opens every pack that matched.
        const open = narrowed || openPacks.has(pack.id)
        // A search that found lists by their name or words shows those; one that found the pack by its name or labels shows all.
        const found = new Set(matchingListIds(item, query))
        const byName = !!query.trim() && pack.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
        const rows = found.size && !byName ? item.lists.filter(row => found.has(row.list.id)) : item.lists
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
          onDeletePack={() => { packDeleted.current = false; setDeletingPack({ open: true, item, position: shown.indexOf(item) }) }}
          followed={followed} onUnfollow={() => setUnfollowing({ id: pack.id, name: pack.name })}>
          {rows.map(row => <ListRow key={row.list.id} item={row} now={now} highlight={highlight === row.list.id} disabled={saving} canCopy={!full} readOnly={followed}
            onEdit={() => onEdit(row.list)} onExport={() => exportCsv(row.list)} onCopy={() => copy(row.list)}
            onDelete={() => { deleted.current = false; setDeleting({ open: true, item: row, position: rowPosition(row.list.id) }) }} />)}
        </PackRow>
      })}
    </ul> : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{query.trim() ? t('manager.noMatch', { query: query.trim() }) : t('filter.noMatch')}</p>
      <Button variant="outline" onClick={() => { setQuery(''); setFilter(NO_FILTER) }}>{isFiltered(filter) ? t('filter.clearAll') : t('manager.clearSearch')}</Button>
    </div>}
    <p className="text-xs text-muted-foreground">{t('manager.csvNote')}</p>
    <OrphanShares orphans={orphans} onStop={stop} focusWhenGone="list-heading" />

    {deleting.item && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={t('delete.title', { name: deleting.item.list.name })}
      description={[deleting.item.practiceCount ? t('delete.withRecords') : t('delete.listOnly'), deletingPackName ? t('delete.lastInPack', { name: deletingPackName }) : ''].filter(Boolean).join(' ')}
      onCloseAutoFocus={focusAfterDelete}
      onConfirm={async () => {
        const list = deleting.item?.list
        if (!list) return false
        const saved = await update(current => current.filter(item => item.id !== list.id))
        if (saved) {
          deleted.current = true
          notify(t('page.deleted', { name: list.name }))
        }
        return saved
      }}>
      <DeleteDetails item={deleting.item} now={now} onExport={() => exportCsv(deleting.item!.list)} />
    </DeleteConfirmation>}

    {deletingPack.item && <DeleteConfirmation open={deletingPack.open} onOpenChange={open => setDeletingPack(current => ({ ...current, open }))}
      title={t('delete.packTitle', { name: deletingPack.item.pack.name })}
      description={[t('delete.packDescription', { lists: deletingPack.item.lists.length, records: deletingPack.item.practiceCount }),
        shares.has(deletingPack.item.pack.id) ? t('delete.shareEnds') : ''].filter(Boolean).join(' ')}
      onCloseAutoFocus={focusAfterDeletePack}
      onConfirm={async () => {
        const pack = deletingPack.item?.pack
        if (!pack) return false
        const saved = await updateLibrary(current => deletePack(current, pack.id))
        if (saved) {
          packDeleted.current = true
          notify(t('page.packDeleted', { name: pack.name }))
        }
        return saved
      }} />}

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

function DeleteDetails({ item, now, onExport }: { item: ListOverview; now: Date; onExport: () => void }) {
  const t = useTranslations('wordLists.delete')
  const format = useFormat()
  const { list } = item
  return <div className="space-y-3">
    <dl className="grid gap-1 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <dt className="sr-only">{t('list')}</dt><dd className="font-medium [overflow-wrap:anywhere]">{list.name}</dd>
      <dt className="sr-only">{t('contents')}</dt>
      <dd className="text-[13px] text-muted-foreground tabular-nums">
        {t('wordCount', { count: list.words.length })} · {item.lastPracticed === null ? t('noRecords')
          : t('records', { count: item.practiceCount, day: format.day(new Date(item.lastPracticed), now) })}
      </dd>
    </dl>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
      <span className="min-w-0 flex-1 basis-56">{t('exportHint')}</span>
      <Button variant="outline" size="lg" className="text-foreground" onClick={onExport}><Download aria-hidden="true" />{t('export')}</Button>
    </div>
  </div>
}

function OrderMenu({ value, onChange }: { value: ListOrder; onChange: (value: ListOrder) => void }) {
  const t = useTranslations('wordLists.order')
  const item = 'relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger aria-label={t('current', { order: t(value) })}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30">
      <span className="text-muted-foreground">{t('label')}</span>{t(value)}<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.RadioGroup value={value} onValueChange={next => onChange(next as ListOrder)}>
          {LIST_ORDERS.map(key => <DropdownMenu.RadioItem key={key} value={key} className={item}>
            <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
            {t(key)}
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}

function EmptyState({ actions }: { actions?: ReactNode }) {
  const t = useTranslations('wordLists')
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:py-14">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><ListPlus className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 id="empty-heading" tabIndex={-1} className="font-bold outline-none">{t('empty.packTitle')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.packDescription')}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      <Button asChild><Link href="/packs/catalog"><LibraryIcon aria-hidden="true" />{t('empty.catalogLink')}</Link></Button>
      <Button asChild variant="outline"><Link href="/packs/create"><Plus aria-hidden="true" />{t('manager.createPack')}</Link></Button>
      {actions}
    </div>
  </div>
}
