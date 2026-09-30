"use client"
import { Suspense, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { HardDrive, History, Keyboard, Trophy } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useSaveNotification } from "@/components/SaveNotification"
import FilterMenu, { type FilterOption } from "@/components/Records/FilterMenu"
import ListSummary from "@/components/Records/ListSummary"
import RecordRow, { clock, recordColumns, RecordTime } from "@/components/Records/RecordRow"
import { GUEST_ACCOUNT_ID } from "@/lib/guestWorkspace"
import { useWordLists } from "@/lib/useWordLists"
import { deviceLabel } from "@/lib/devices"
import { formatDay, formatDuration, formatWeekday } from "@/lib/dashboard"
import { deviceOptions, filterRows, formatAccuracy, formatRecordTime, groupByDay, listBest, recordRows, removeRecord, type RecordFilter, type RecordRow as Row } from "@/lib/records"
import type { SavedWordList } from "@/lib/wordLists"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50

// `?list=<id>&device=<id>` keeps the filter in the URL, so the practice result and the dashboard can link to one list's history.
export default function Records() {
  return <Suspense fallback={<Loading />}><RecordsPage /></Suspense>
}

function Loading() {
  return <div role="status" className="space-y-3"><span className="sr-only">読み込み中…</span><Skeleton className="h-9 w-72" /><Skeleton className="h-64 w-full" /></div>
}

function RecordsPage() {
  const workspace = useWordLists()
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">練習記録</h1>
        <p className="text-sm text-muted-foreground">
          これまでの練習を新しい順に表示します。リストごとの上位は<Link href="/rankings" className="underline underline-offset-3 hover:text-foreground">ベスト記録</Link>、推移は<Link href="/home" className="underline underline-offset-3 hover:text-foreground">ホーム</Link>で見られます。
        </p>
      </div>
      {workspace.ready && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
        title={workspace.accountId === GUEST_ACCOUNT_ID ? '未ログインのため、このブラウザーのLocalStorageに保存します。' : 'ログイン中のアカウントに保存します。'}>
        <HardDrive className="size-3.5" aria-hidden="true" />{workspace.accountId === GUEST_ACCOUNT_ID ? 'このブラウザーに保存' : 'アカウントに保存'}
      </span>}
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

function filterOptions(rows: Row[], lists: SavedWordList[]) {
  const listOptions: FilterOption[] = lists.map(list => ({ value: list.id, label: list.name, count: list.records.length }))
  return { listOptions, deviceOptions: deviceOptions(rows.map(row => row.record)) }
}

function dayHeading(day: Date, now: Date) {
  const relative = formatDay(day, now)
  const date = `${day.getFullYear() === now.getFullYear() ? '' : `${day.getFullYear()}年`}${formatWeekday(day)}`
  return relative === '今日' || relative === '昨日' ? `${relative} · ${date}` : date
}

function RecordHistory({ lists, saving, update }: {
  lists: SavedWordList[]
  saving: boolean
  update: (change: (current: SavedWordList[]) => SavedWordList[]) => Promise<boolean>
}) {
  const notify = useSaveNotification()
  const [filter, setFilter] = useFilter()
  const [now] = useState(() => new Date())
  const [shown, setShown] = useState(PAGE_SIZE)
  const [deleting, setDeleting] = useState<{ open: boolean; row: Row | null; position: number }>({ open: false, row: null, position: 0 })
  const deleted = useRef(false)
  const all = useMemo(() => recordRows(lists), [lists])
  const { listOptions, deviceOptions: devicesOptions } = useMemo(() => filterOptions(all, lists), [all, lists])
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
      <FilterMenu name="リスト" allLabel="すべてのリスト" value={filter.list} options={listOptions} onChange={list => changeFilter({ ...filter, list })} />
      <FilterMenu name="端末" allLabel="すべての端末" value={filter.device} options={devicesOptions} onChange={device => changeFilter({ ...filter, device })} />
      {filtered && <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => changeFilter({ list: null, device: null })}>絞り込みを解除</Button>}
      <p id="record-count" tabIndex={-1} aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums outline-none">{filtered ? `${rows.length}件 / 全${all.length}件` : `${all.length}件`}</p>
    </div>

    {selectedList && selectedList.records.length > 0 && <ListSummary list={selectedList} now={now} />}

    {!rows.length ? <FilteredEmpty list={selectedList} onClear={() => changeFilter({ list: null, device: null })} /> : <div className="space-y-6">
      <div aria-hidden="true" className={cn('hidden px-5 text-xs text-muted-foreground sm:grid', recordColumns)}>
        <span>時刻</span><span>{filter.list ? '端末・単語数' : 'リスト・端末'}</span><span className="text-right">所要時間</span><span className="text-right">正確率</span>
        <span className="text-right">1語あたり</span><span className="text-right">ミス</span><span />
      </div>
      {groups.map(group => <section key={group.day.getTime()} aria-label={dayHeading(group.day, now)} className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-sm font-bold">{dayHeading(group.day, now)}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">{group.rows.length}回 · {formatDuration(group.seconds)}</p>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {group.rows.map(row => <RecordRow key={row.key} row={row} showList={!filter.list} disabled={saving} onDelete={() => {
            deleted.current = false
            setDeleting({ open: true, row, position: rows.indexOf(row) })
          }} />)}
        </ul>
      </section>)}
      {rows.length > shown && <div className="flex justify-center">
        <Button variant="outline" onClick={() => setShown(current => current + PAGE_SIZE)}>さらに表示（残り {rows.length - shown}件）</Button>
      </div>}
      <p className="text-xs text-muted-foreground">
        単語数・端末名は練習した時点のものです。{missing && '「—」は記録されていない項目です（以前のバージョンで保存した記録など）。'}
      </p>
    </div>}

    {deleting.row && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title="この練習記録を削除しますか？" description={`「${deleting.row.list.name}」の記録を1件削除します。`}
      onCloseAutoFocus={focusAfterDelete}
      onConfirm={async () => {
        const row = deleting.row
        if (!row) return false
        const saved = await update(current => removeRecord(current, row.list.id, row.record))
        if (saved) {
          deleted.current = true
          const date = new Date(row.record.date)
          notify(`「${row.list.name}」の練習記録（${date.getMonth() + 1}月${date.getDate()}日 ${clock(row.record.date)}）を削除しました。`)
        }
        return saved
      }}>
      <DeleteDetails row={deleting.row} now={now} />
    </DeleteConfirmation>}
  </div>
}

function DeleteDetails({ row, now }: { row: Row; now: Date }) {
  const { list, record, best } = row
  const next = best ? listBest({ ...list, records: list.records.filter(item => item !== record) }) : undefined
  return <div className="space-y-3">
    <dl className="grid gap-1 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <dt className="sr-only">リスト</dt><dd className="font-medium [overflow-wrap:anywhere]">{list.name}</dd>
      <dt className="sr-only">日時・端末</dt>
      <dd className="text-[13px] text-muted-foreground">{dayHeading(new Date(record.date), now)} {clock(record.date)} · {deviceLabel(record.device)}</dd>
      <dt className="sr-only">結果</dt>
      <dd className="tabular-nums"><RecordTime seconds={record.time} className="font-bold" /><span className="ml-3">正確率 {formatAccuracy(record.accuracy)}</span><span className="ml-3">ミス {record.mistakes ?? '—'}</span></dd>
    </dl>
    {best && <p className="flex gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <Trophy className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>このリストのベスト記録です。{next ? <>削除すると、ベストは {formatRecordTime(next.time)}（{formatAccuracy(next.accuracy)}）になります。</> : '削除すると、このリストの記録はなくなります。'}</span>
    </p>}
  </div>
}

function EmptyState() {
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:py-14">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><History className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 className="font-bold">まだ練習記録がありません</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">「練習する」でリストを最後まで入力すると、所要時間・正確率・ミス・使った端末がここに残ります。</p>
    </div>
    <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />練習する</Link></Button>
  </div>
}

function FilteredEmpty({ list, onClear }: { list?: SavedWordList; onClear: () => void }) {
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
    <div className="space-y-1.5">
      <h2 className="font-bold">{list && !list.records.length ? `「${list.name}」の記録はまだありません` : '条件に合う記録はありません'}</h2>
      <p className="text-sm text-muted-foreground">{list && !list.records.length ? '練習すると、ここに記録が表示されます。' : 'リストや端末の条件を変えてください。'}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      {list && <Button asChild><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />このリストを練習する</Link></Button>}
      <Button variant="outline" onClick={onClear}>絞り込みを解除</Button>
    </div>
  </div>
}
