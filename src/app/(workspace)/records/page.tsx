"use client"
import { Suspense, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ErrorAlert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useSaveNotification } from "@/components/SaveNotification"
import FilterMenu, { type FilterOption } from "@/components/Records/FilterMenu"
import ListSummary from "@/components/Records/ListSummary"
import RecordRow, { recordColumns } from "@/components/Records/RecordRow"
import { useFormat } from "@/i18n/useFormat"
import { useWordLists, type Workspace } from "@/lib/useWordLists"
import { usePracticeName } from "@/components/PracticeName"
import { deviceOptions, filterRows, groupByDay, recordRows, type RecordFilter, type RecordRow as Row } from "@/core/records"
import { levelName } from "@/core/listOverview"
import { packRecordOptions } from "@/core/packRecords"
import type { SavedWordList } from "@/core/wordLists"
import type { WordPack } from "@/core/wordPacks"
import { cn } from "@/lib/utils"
import PageStorageBadge from "@/components/PageStorageBadge"
import { PageHeader, PageMain } from "@/components/ui/page-layout"
import { CardList } from "@/components/ui/card"
import { FilteredEmpty, NoRecords } from "@/components/Records/RecordsEmpty"
import RecordDeleteDetails from "@/components/Records/RecordDeleteDetails"
import { useDayHeading } from "@/lib/useDayHeading"
import { useRecordFilter } from "@/lib/useRecordFilter"

const PAGE_SIZE = 50

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
  return <PageMain width="medium">
    <PageHeader title={t('title')} description={t.rich('intro', {
        rankings: chunks => <Link href="/rankings" className={link}>{chunks}</Link>,
        home: chunks => <Link href="/home" className={link}>{chunks}</Link>,
      })}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6">{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <Loading /> : <RecordHistory key={workspace.accountId} failed={Boolean(workspace.error)} lists={workspace.lists} packs={workspace.packs} saving={workspace.saving} deleteRecord={workspace.deleteRecord} />}
  </PageMain>
}

function RecordHistory({ failed, lists, packs, saving, deleteRecord }: {
  failed: boolean
  lists: SavedWordList[]
  packs: WordPack[]
  saving: boolean
  deleteRecord: Workspace['deleteRecord']
}) {
  const t = useTranslations('records')
  const format = useFormat()
  const notify = useSaveNotification()
  const nameOf = usePracticeName()
  const [requested, setFilter] = useRecordFilter()
  const [now] = useState(() => new Date())
  const dayHeading = useDayHeading(now)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [deleting, setDeleting] = useState<{ open: boolean; row: Row | null; position: number }>({ open: false, row: null, position: 0 })
  const deleted = useRef(false)
  const all = useMemo(() => recordRows(lists), [lists])
  // An unknown pack is no filter, and a list outside the chosen pack is dropped, so the URL cannot name an empty combination.
  const requestedList = lists.find(list => list.id === requested.list)
  const pack = packs.some(item => item.id === requested.pack) ? requested.pack : null
  const filter = useMemo<RecordFilter>(() => ({ pack, list: pack && requestedList && requestedList.packId !== pack ? null : requested.list, device: requested.device }),
    [pack, requestedList, requested.list, requested.device])
  const packOptions = useMemo<FilterOption[]>(() => packRecordOptions(packs, lists, filter.pack), [packs, lists, filter.pack])
  // With a pack chosen the lists are only its lists, named by their level since the pack is already named in the filter.
  const listOptions = useMemo<FilterOption[]>(() => lists.filter(list => !filter.pack || list.packId === filter.pack)
    .map(list => ({ value: list.id, label: filter.pack ? levelName(list) : nameOf(list), count: list.records.length })), [lists, filter.pack, nameOf])
  const devicesOptions = useMemo<FilterOption[]>(() => deviceOptions(all.map(row => row.record)).map(({ value, device, count }) =>
    ({ value, count, label: format.recordDevice(device) })), [all, format])
  const selectedList = filter.list ? requestedList : undefined
  const { pack: packId, list: listId, device: deviceId } = filter
  const rows = useMemo(() => filterRows(all, { pack: packId, list: listId, device: deviceId }), [all, packId, listId, deviceId])
  const groups = groupByDay(rows.slice(0, shown))
  const filtered = Boolean(filter.pack || filter.list || filter.device)
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

  // After a failed load no records does not mean none were practised, so the error stands alone.
  if (!all.length) return failed ? null : <NoRecords />

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu name={t('filter.pack')} allLabel={t('filter.allPacks')} value={filter.pack} options={packOptions}
        onChange={pack => changeFilter({ ...filter, pack, list: pack && selectedList?.packId !== pack ? null : filter.list })} />
      <FilterMenu name={t('filter.list')} allLabel={t('filter.allLists')} value={filter.list} options={listOptions} onChange={list => changeFilter({ ...filter, list })} />
      <FilterMenu name={t('filter.device')} allLabel={t('filter.allDevices')} value={filter.device} options={devicesOptions} onChange={device => changeFilter({ ...filter, device })} />
      {filtered && <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => changeFilter({ pack: null, list: null, device: null })}>{t('filter.clear')}</Button>}
      <p id="record-count" tabIndex={-1} aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums outline-none">{filtered ? t('filter.filteredCount', { count: rows.length, total: all.length }) : t('filter.count', { count: all.length })}</p>
    </div>

    {selectedList && selectedList.records.length > 0 && <ListSummary list={selectedList} now={now} />}

    {!rows.length ? <FilteredEmpty list={selectedList} onClear={() => changeFilter({ pack: null, list: null, device: null })} /> : <div className="space-y-6">
      <div aria-hidden="true" className={cn('hidden px-5 text-xs text-muted-foreground sm:grid', recordColumns)}>
        <span>{t('columns.time')}</span><span>{t(filter.list ? 'columns.deviceWords' : 'columns.listDevice')}</span><span className="text-right">{t('columns.duration')}</span><span className="text-right">{t('columns.accuracy')}</span>
        <span className="text-right">{t('columns.perWord')}</span><span className="text-right">{t('columns.mistakes')}</span><span />
      </div>
      {groups.map(group => <section key={group.day.getTime()} aria-label={dayHeading(group.day)} className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-sm font-bold">{dayHeading(group.day)}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">{t('day.summary', { count: group.rows.length, duration: format.duration(group.seconds) })}</p>
        </div>
        <CardList>
          {group.rows.map(row => <RecordRow key={row.key} row={row} showList={!filter.list} inPack={Boolean(filter.pack)} disabled={saving} onDelete={() => {
            deleted.current = false
            setDeleting({ open: true, row, position: rows.indexOf(row) })
          }} />)}
        </CardList>
      </section>)}
      {rows.length > shown && <div className="flex justify-center">
        <Button variant="outline" onClick={() => setShown(current => current + PAGE_SIZE)}>{t('more', { count: rows.length - shown })}</Button>
      </div>}
      <p className="text-xs text-muted-foreground">
        {t('note')}{missing && t('noteMissing')}
      </p>
    </div>}

    {deleting.row && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={t('delete.title')} description={t('delete.description', { name: nameOf(deleting.row.list) })}
      onCloseAutoFocus={focusAfterDelete}
      onConfirm={async () => {
        const row = deleting.row
        if (!row) return false
        const saved = await deleteRecord(row.list.id, row.record)
        if (saved) {
          deleted.current = true
          const date = new Date(row.record.date)
          notify(t('delete.done', { name: nameOf(row.list), date: format.monthDay(date), time: format.clock(date) }))
        }
        return saved
      }}>
      <RecordDeleteDetails row={deleting.row} dayHeading={dayHeading} />
    </DeleteConfirmation>}
  </div>
}
