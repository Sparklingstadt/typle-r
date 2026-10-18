"use client"
import { Suspense, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { History, Keyboard, Trophy } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useSaveNotification } from "@/components/SaveNotification"
import FilterMenu, { type FilterOption } from "@/components/Records/FilterMenu"
import ListSummary from "@/components/Records/ListSummary"
import RecordRow, { recordColumns, RecordTime } from "@/components/Records/RecordRow"
import { useFormat } from "@/i18n/useFormat"
import { useWordLists } from "@/lib/useWordLists"
import { dayKind } from "@/core/dashboard"
import { deviceOptions, filterRows, formatAccuracy, groupByDay, listBest, recordRows, removeRecord, type RecordFilter, type RecordRow as Row } from "@/core/records"
import type { SavedWordList } from "@/core/wordLists"
import { cn } from "@/lib/utils"
import PageStorageBadge from "@/components/PageStorageBadge"

const PAGE_SIZE = 50

// `?list=<id>&device=<id>` keeps the filter in the URL, so the practice result and the dashboard can link to one list's history.
export default function Records() {
  return <Suspense fallback={<Loading />}><RecordsPage /></Suspense>
}

function Loading() {
  const common = useTranslations('common')
  return <div role="status" className="space-y-3"><span className="sr-only">{common('loading')}</span><Skeleton className="h-9 w-72" /><Skeleton className="h-64 w-full" /></div>
}

function RecordsPage() {
  const t = useTranslations('records')
  const workspace = useWordLists()
  const link = "underline underline-offset-3 hover:text-foreground"
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t.rich('intro', {
            rankings: chunks => <Link href="/rankings" className={link}>{chunks}</Link>,
            home: chunks => <Link href="/home" className={link}>{chunks}</Link>,
          })}
        </p>
      </div>
      {workspace.ready && <PageStorageBadge />}
    </header>
    {workspace.error && <Alert variant="destructive" className="mb-6"><AlertDescription>{workspace.error}</AlertDescription></Alert>}
    {!workspace.ready ? <Loading /> : <RecordHistory key={workspace.accountId} lists={workspace.lists} saving={workspace.saving} update={workspace.update} />}
  </main>
}

function useFilter(): [RecordFilter, (next: RecordFilter) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const filter = { list: params.get('list'), device: params.get('device') }
  return [filter, next => {
    const query = new URLSearchParams()
    if (next.list) query.set('list', next.list)
    if (next.device) query.set('device', next.device)
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false })
  }]
}

// Today and yesterday are named before the date; other days show the date alone.
function useDayHeading(now: Date) {
  const t = useTranslations('records.day')
  const format = useFormat()
  return (day: Date) => {
    const date = format.dateWithWeekday(day, now)
    const kind = dayKind(day, now)
    return kind === 'today' || kind === 'yesterday' ? t('heading', { relative: format.day(day, now), date }) : date
  }
}

function RecordHistory({ lists, saving, update }: {
  lists: SavedWordList[]
  saving: boolean
  update: (change: (current: SavedWordList[]) => SavedWordList[]) => Promise<boolean>
}) {
  const t = useTranslations('records')
  const format = useFormat()
  const notify = useSaveNotification()
  const [filter, setFilter] = useFilter()
  const [now] = useState(() => new Date())
  const dayHeading = useDayHeading(now)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [deleting, setDeleting] = useState<{ open: boolean; row: Row | null; position: number }>({ open: false, row: null, position: 0 })
  const deleted = useRef(false)
  const all = useMemo(() => recordRows(lists), [lists])
  const listOptions = useMemo<FilterOption[]>(() => lists.map(list => ({ value: list.id, label: list.name, count: list.records.length })), [lists])
  const devicesOptions = useMemo<FilterOption[]>(() => deviceOptions(all.map(row => row.record)).map(({ value, device, count }) =>
    ({ value, count, label: format.recordDevice(device) })), [all, format])
  const selectedList = lists.find(list => list.id === filter.list)
  const { list: listId, device: deviceId } = filter
  const rows = useMemo(() => filterRows(all, { list: listId, device: deviceId }), [all, listId, deviceId])
  const groups = groupByDay(rows.slice(0, shown))
  const filtered = Boolean(filter.list || filter.device)
  const missing = rows.slice(0, shown).some(({ record }) => record.accuracy === undefined || record.wordCount === undefined)

  function changeFilter(next: RecordFilter) {
    setShown(PAGE_SIZE)
    setFilter(next)
  }

  // After a deletion, focus the delete button that took the removed row's place so the next record can be removed too.
  function focusAfterDelete(event: Event) {
    event.preventDefault()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-delete-record]')
    const target = deleted.current ? buttons[Math.min(deleting.position, buttons.length - 1)] : buttons[deleting.position]
    if (target) target.focus()
    else document.getElementById('record-count')?.focus()
  }

  if (!all.length) return <EmptyState />

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu name={t('filter.list')} allLabel={t('filter.allLists')} value={filter.list} options={listOptions} onChange={list => changeFilter({ ...filter, list })} />
      <FilterMenu name={t('filter.device')} allLabel={t('filter.allDevices')} value={filter.device} options={devicesOptions} onChange={device => changeFilter({ ...filter, device })} />
      {filtered && <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => changeFilter({ list: null, device: null })}>{t('filter.clear')}</Button>}
      <p id="record-count" tabIndex={-1} aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums outline-none">{filtered ? t('filter.filteredCount', { count: rows.length, total: all.length }) : t('filter.count', { count: all.length })}</p>
    </div>

    {selectedList && selectedList.records.length > 0 && <ListSummary list={selectedList} now={now} />}

    {!rows.length ? <FilteredEmpty list={selectedList} onClear={() => changeFilter({ list: null, device: null })} /> : <div className="space-y-6">
      <div aria-hidden="true" className={cn('hidden px-5 text-xs text-muted-foreground sm:grid', recordColumns)}>
        <span>{t('columns.time')}</span><span>{t(filter.list ? 'columns.deviceWords' : 'columns.listDevice')}</span><span className="text-right">{t('columns.duration')}</span><span className="text-right">{t('columns.accuracy')}</span>
        <span className="text-right">{t('columns.perWord')}</span><span className="text-right">{t('columns.mistakes')}</span><span />
      </div>
      {groups.map(group => <section key={group.day.getTime()} aria-label={dayHeading(group.day)} className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-sm font-bold">{dayHeading(group.day)}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">{t('day.summary', { count: group.rows.length, duration: format.duration(group.seconds) })}</p>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {group.rows.map(row => <RecordRow key={row.key} row={row} showList={!filter.list} disabled={saving} onDelete={() => {
            deleted.current = false
            setDeleting({ open: true, row, position: rows.indexOf(row) })
          }} />)}
        </ul>
      </section>)}
      {rows.length > shown && <div className="flex justify-center">
        <Button variant="outline" onClick={() => setShown(current => current + PAGE_SIZE)}>{t('more', { count: rows.length - shown })}</Button>
      </div>}
      <p className="text-xs text-muted-foreground">
        {t('note')}{missing && t('noteMissing')}
      </p>
    </div>}

    {deleting.row && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={t('delete.title')} description={t('delete.description', { name: deleting.row.list.name })}
      onCloseAutoFocus={focusAfterDelete}
      onConfirm={async () => {
        const row = deleting.row
        if (!row) return false
        const saved = await update(current => removeRecord(current, row.list.id, row.record))
        if (saved) {
          deleted.current = true
          const date = new Date(row.record.date)
          notify(t('delete.done', { name: row.list.name, date: format.monthDay(date), time: format.clock(date) }))
        }
        return saved
      }}>
      <DeleteDetails row={deleting.row} dayHeading={dayHeading} />
    </DeleteConfirmation>}
  </div>
}

function DeleteDetails({ row, dayHeading }: { row: Row; dayHeading: (day: Date) => string }) {
  const t = useTranslations('records.delete')
  const format = useFormat()
  const { list, record, best } = row
  const date = new Date(record.date)
  const next = best ? listBest({ ...list, records: list.records.filter(item => item !== record) }) : undefined
  return <div className="space-y-3">
    <dl className="grid gap-1 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <dt className="sr-only">{t('list')}</dt><dd className="font-medium [overflow-wrap:anywhere]">{list.name}</dd>
      <dt className="sr-only">{t('when')}</dt>
      <dd className="text-[13px] text-muted-foreground">{dayHeading(date)} {format.clock(date)} · {format.device(record.device)}</dd>
      <dt className="sr-only">{t('result')}</dt>
      <dd className="tabular-nums"><RecordTime seconds={record.time} className="font-bold" /><span className="ml-3">{t('accuracy', { value: formatAccuracy(record.accuracy) })}</span><span className="ml-3">{t('mistakes', { value: record.mistakes ?? '—' })}</span></dd>
    </dl>
    {best && <p className="flex gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <Trophy className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{next ? t('bestNext', { time: format.recordTime(next.time), accuracy: formatAccuracy(next.accuracy) }) : t('bestLast')}</span>
    </p>}
  </div>
}

function EmptyState() {
  const t = useTranslations('records.empty')
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:py-14">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><History className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('description')}</p>
    </div>
    <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
  </div>
}

function FilteredEmpty({ list, onClear }: { list?: SavedWordList; onClear: () => void }) {
  const t = useTranslations('records')
  const unpractised = list && !list.records.length
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
    <div className="space-y-1.5">
      <h2 className="font-bold">{unpractised ? t('filteredEmpty.listTitle', { name: list.name }) : t('filteredEmpty.title')}</h2>
      <p className="text-sm text-muted-foreground">{t(unpractised ? 'filteredEmpty.listDescription' : 'filteredEmpty.description')}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      {list && <Button asChild><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />{t('filteredEmpty.practiceList')}</Link></Button>}
      <Button variant="outline" onClick={onClear}>{t('filter.clear')}</Button>
    </div>
  </div>
}
