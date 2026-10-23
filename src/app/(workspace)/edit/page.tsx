"use client"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { DropdownMenu } from "radix-ui"
import { Check, ChevronDown, CircleAlert, Download, ListPlus, Plus, RotateCw, Search, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useSaveNotification } from "@/components/SaveNotification"
import WordListEditor from "@/components/WordListEditor"
import { downloadWordCsv } from "@/components/WordListExport"
import ListRow, { usePracticeText } from "@/components/WordLists/ListRow"
import LabelFilter from "@/components/WordLists/LabelFilter"
import GroupRow from "@/components/WordLists/GroupRow"
import { useWordLists } from "@/lib/useWordLists"
import { useFormat } from "@/i18n/useFormat"
import { randomId } from "@/core/randomId"
import { duplicateList, groupEntries, isFiltered, LIST_ORDERS, listLabels, listOverviews, matchesFilter, matchesQuery, MAX_LISTS, NO_FILTER, sortOverviews, type ListFilter, type ListOrder, type ListOverview } from "@/core/listOverview"
import { saveList, type SavedWordList } from "@/core/wordLists"
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
    <PageStorageBadge storage={storage} />
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
  const { lists, error, errorKey, saving, update, storage } = workspace
  const t = useTranslations('wordLists.page')
  const practiceText = usePracticeText()
  const notify = useSaveNotification()
  const params = useSearchParams()
  const urlId = params.get('list')
  const [openId, setOpenId] = useState(urlId)
  const [seenUrl, setSeenUrl] = useState(urlId)
  const [dirty, setDirty] = useState(false)
  const [cancelRequest, setCancelRequest] = useState(0)
  const [highlight, setHighlight] = useState<string | null>(null)
  // The open groups stay open while a list of one is edited, so the row is there to return to.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
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

  if (openId && editing) return <WordListEditor key={editing.id} title={t('editTitle')} initial={editing} lists={lists} error={error} errorKey={errorKey}
    description={t('editDescription', { count: editing.words.length, practice: practiceText(listOverviews([editing])[0], new Date()) })}
    storage={storage} onDirtyChange={trackDirty} cancelRequest={cancelRequest}
    onCancel={() => close()} onSave={async list => {
      const saved = await update(current => saveList(current, list, true))
      if (saved) { close(list.id); notify(t('updated', { name: list.name.trim() })) }
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
    {!(error && !lists.length) && <ListManager lists={lists} saving={saving} highlight={highlight} update={update} notify={notify}
      openGroups={openGroups} onOpenGroupsChange={setOpenGroups} onEdit={open} onHighlight={setHighlight} />}
  </>
}

function ListManager({ lists, saving, highlight, update, notify, openGroups, onOpenGroupsChange, onEdit, onHighlight }: {
  lists: SavedWordList[]
  saving: boolean
  highlight: string | null
  openGroups: Set<string>
  onOpenGroupsChange: (value: Set<string>) => void
  update: Workspace['update']
  notify: (message: string) => void
  onEdit: (list: SavedWordList) => void
  onHighlight: (id: string) => void
}) {
  const t = useTranslations('wordLists')
  const locale = useLocale()
  const [now] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<ListOrder>('added')
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [exportError, setExportError] = useState('')
  const [deleting, setDeleting] = useState<{ open: boolean; item: ListOverview | null; position: number }>({ open: false, item: null, position: 0 })
  const deleted = useRef(false)
  const all = useMemo(() => listOverviews(lists), [lists])
  const labels = useMemo(() => listLabels(lists, locale), [lists, locale])
  const shown = useMemo(() => sortOverviews(all.filter(item => matchesQuery(item.list, query) && matchesFilter(item.list, filter)), order, locale),
    [all, query, filter, order, locale])
  const narrowed = !!query.trim() || isFiltered(filter)
  const full = lists.length >= MAX_LISTS

  function exportCsv(list: SavedWordList) {
    setExportError(downloadWordCsv(list) ? '' : t('page.exportFailed', { name: list.name }))
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

  // A list just changed is shown in its group, which stays open.
  const highlightGroup = lists.find(list => list.id === highlight)?.group?.trim()
  useEffect(() => {
    if (highlightGroup && !openGroups.has(highlightGroup)) onOpenGroupsChange(new Set([...openGroups, highlightGroup]))
  }, [highlightGroup, openGroups, onOpenGroupsChange])

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

  if (!lists.length) return <EmptyState />

  return <section aria-labelledby="list-heading" className="space-y-3">
    <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2">
      <h2 id="list-heading" tabIndex={-1} className="text-base font-bold outline-none">{t('manager.heading')}</h2>
      <Badge variant="secondary" className="tabular-nums" title={t('manager.limitTitle', { max: MAX_LISTS })}>{lists.length} / {MAX_LISTS}</Badge>
      {full ? <Button className="ml-auto" disabled><Plus aria-hidden="true" />{t('manager.create')}</Button>
        : <Button asChild className="ml-auto"><Link href="/create"><Plus aria-hidden="true" />{t('manager.create')}</Link></Button>}
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
      <p aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums">{narrowed ? t('manager.countFiltered', { shown: shown.length, total: lists.length }) : t('manager.count', { total: lists.length })}</p>
    </div>

    {shown.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {groupEntries(shown, item => item.list, lists).map(entry => {
        const row = (item: ListOverview) => <ListRow key={item.list.id} item={item} now={now} highlight={highlight === item.list.id} disabled={saving} canCopy={!full}
          onEdit={() => onEdit(item.list)} onExport={() => exportCsv(item.list)} onCopy={() => copy(item.list)}
          onDelete={() => { deleted.current = false; setDeleting({ open: true, item, position: rowPosition(item.list.id) }) }} />
        if (entry.group === null) return row(entry.items[0])
        const group = entry.group
        // A search or filter shows the matching lists of every group.
        const open = narrowed || openGroups.has(group)
        // Inside a group the lists keep their saved order, which goes from the first level to the last.
        const items = [...entry.items].sort((a, b) => a.position - b.position)
        return <GroupRow key={`group:${group}`} group={group} items={items} now={now} open={open}
          onToggle={() => {
            const next = new Set(openGroups)
            if (open) next.delete(group)
            else next.add(group)
            onOpenGroupsChange(next)
          }}>{items.map(row)}</GroupRow>
      })}
    </ul> : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{query.trim() ? t('manager.noMatch', { query: query.trim() }) : t('filter.noMatch')}</p>
      <Button variant="outline" onClick={() => { setQuery(''); setFilter(NO_FILTER) }}>{isFiltered(filter) ? t('filter.clearAll') : t('manager.clearSearch')}</Button>
    </div>}
    <p className="text-xs text-muted-foreground">{t('manager.csvNote')}</p>

    {deleting.item && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={t('delete.title', { name: deleting.item.list.name })}
      description={`${deleting.item.practiceCount ? t('delete.withRecords') : t('delete.listOnly')}`}
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

function EmptyState() {
  const t = useTranslations('wordLists')
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:py-14">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><ListPlus className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('empty.title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.description')}</p>
    </div>
    <Button asChild><Link href="/create"><Plus aria-hidden="true" />{t('manager.create')}</Link></Button>
  </div>
}
