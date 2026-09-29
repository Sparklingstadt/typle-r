"use client"
// Design prototype for the /rankings redesign (captured into the Figma boards; not wired for production).
import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { DropdownMenu } from 'radix-ui'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, CircleAlert, HardDrive, History, Info, Keyboard, Plus, RotateCw, Search, Trophy, TrendingUp, X } from 'lucide-react'
import { useWordLists } from '@/lib/useWordLists'
import { GUEST_ACCOUNT_ID } from '@/lib/guestWorkspace'
import { formatDay, speedScale } from '@/lib/dashboard'
import type { PracticeDevice } from '@/lib/devices'
import type { SavedWordList } from '@/lib/wordLists'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import TrendChart from '@/components/Dashboard/TrendChart'

type StoredRecord = SavedWordList['records'][number]
type Order = 'accuracy' | 'speed'
type SortKey = 'recent' | 'name' | 'count'
const DAY = 86400000
const TOP = 5

export function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(2)} 秒`
  return `${Math.floor(seconds / 60)}分${(seconds % 60).toFixed(2).padStart(5, '0')}秒`
}
const clock = (date: Date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`

function rank(records: StoredRecord[], order: Order) {
  return [...records].sort(order === 'accuracy'
    ? (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1) || a.time - b.time
    : (a, b) => a.time - b.time || (b.accuracy ?? -1) - (a.accuracy ?? -1))
}
const matchesDevice = (record: StoredRecord, device: string) => device === 'all' || (device === 'none' ? !record.device : record.device?.id === device)

type Summary = ReturnType<typeof summarize>
function summarize(list: SavedWordList, device: string, order: Order, includeOthers: boolean, now: number) {
  const filtered = list.records.filter(record => matchesDevice(record, device))
  const same = filtered.filter(record => record.wordCount === list.words.length)
  const others = filtered.filter(record => record.wordCount !== list.words.length)
  // With no record at the current word count, ranking everything beats showing nothing.
  const fallback = !same.length && others.length > 0
  const ranked = rank(fallback || includeOthers ? filtered : same, order)
  const counts = new Map<number | null, number>()
  for (const record of others) counts.set(record.wordCount ?? null, (counts.get(record.wordCount ?? null) ?? 0) + 1)
  const last = list.records.reduce((max, record) => Math.max(max, Date.parse(record.date)), 0)
  const best = ranked[0]
  return {
    list, ranked, others, fallback, same,
    otherCounts: [...counts].map(([wordCount, count]) => ({ wordCount, count })),
    lastPracticed: last ? new Date(last) : null,
    best,
    recentBest: !!best && now - Date.parse(best.date) < 7 * DAY && ranked.some(record => Date.parse(record.date) < Date.parse(best.date)),
  }
}

function readParams(search: string) {
  const params = new URLSearchParams(search)
  return {
    list: params.get('list'), device: params.get('device') ?? 'all', order: (params.get('order') === 'speed' ? 'speed' : 'accuracy') as Order,
    q: params.get('q') ?? '', include: params.get('include') === '1', all: params.get('all') === '1', mock: params.get('mock'),
    sort: (params.get('sort') ?? 'recent') as SortKey, menu: params.get('menu'),
  }
}

const noSubscription = () => () => {}

export default function RankingsProposal() {
  const workspace = useWordLists()
  // The query string only exists in the browser; the server render shows the loading state.
  const search = useSyncExternalStore(noSubscription, () => window.location.search, () => null)
  const params = useMemo(() => search === null ? null : readParams(search), [search])
  const loading = !workspace.ready || !params || params.mock === 'loading'
  const empty = !loading && !workspace.error && !workspace.lists.some(list => list.records.length)
  return <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">ベスト記録</h1>
        <p className="text-sm text-muted-foreground">単語リストごとの自己ベストです。リストを選ぶと、上位の記録と所要時間の推移を表示します。</p>
      </div>
      {workspace.ready && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground">
        <HardDrive className="size-3.5" aria-hidden="true" />{workspace.accountId === GUEST_ACCOUNT_ID ? 'このブラウザーに保存' : 'アカウントに保存'}
      </span>}
    </header>
    {workspace.error ? <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-64">{workspace.error} 記録は表示できませんが、保存データは変更していません。</span>
        <Button variant="outline" size="lg" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" />再読み込み</Button>
      </AlertDescription>
    </Alert>
      : loading ? <LoadingState />
        : empty ? <EmptyState />
          : <Rankings lists={workspace.lists} devices={workspace.devices} initial={params!} />}
  </main>
}

function Rankings({ lists, devices, initial }: { lists: SavedWordList[]; devices: PracticeDevice[]; initial: ReturnType<typeof readParams> }) {
  const [now] = useState(() => Date.now())
  const [device, setDevice] = useState(initial.device)
  const [order, setOrder] = useState<Order>(initial.order)
  const [query, setQuery] = useState(initial.q)
  const [sort, setSort] = useState<SortKey>(initial.sort)
  const [include, setInclude] = useState(initial.include)
  const [showAll, setShowAll] = useState(initial.all)
  const [opened, setOpened] = useState(!!initial.list)
  const summaries = useMemo(() => lists.map(list => summarize(list, device, order, include, now)), [lists, device, order, include, now])
  const sorted = useMemo(() => [...summaries].sort(sort === 'name' ? (a, b) => a.list.name.localeCompare(b.list.name, 'ja')
    : sort === 'count' ? (a, b) => b.ranked.length - a.ranked.length
      : (a, b) => (b.lastPracticed?.getTime() ?? 0) - (a.lastPracticed?.getTime() ?? 0)), [summaries, sort])
  const [selectedId, setSelectedId] = useState(initial.list ?? sorted.find(item => item.ranked.length)?.list.id ?? lists[0]?.id)
  const selected = summaries.find(item => item.list.id === selectedId) ?? sorted[0]
  const matches = sorted.filter(item => item.list.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const withRecords = matches.filter(item => item.ranked.length)
  const without = matches.filter(item => !item.ranked.length)
  const deviceOptions = useMemo(() => {
    const all = lists.flatMap(list => list.records)
    const count = (id: string) => all.filter(record => matchesDevice(record, id)).length
    const removed = new Map<string, PracticeDevice>()
    for (const record of all) if (record.device && !devices.some(item => item.id === record.device!.id)) removed.set(record.device.id, record.device)
    return {
      registered: devices.map(item => ({ id: item.id, label: item.name, count: count(item.id) })),
      removed: [...removed.values()].map(item => ({ id: item.id, label: item.name, count: count(item.id) })),
      none: count('none'), all: all.length,
    }
  }, [lists, devices])
  const deviceName = device === 'all' ? 'すべて' : device === 'none' ? '記録なし' : [...deviceOptions.registered, ...deviceOptions.removed].find(item => item.id === device)?.label ?? '—'

  // Keep the detail useful after filtering: move to the most recent list that has records on that device.
  function changeDevice(next: string) {
    setDevice(next)
    const current = lists.find(list => list.id === selectedId)
    if (current && current.records.some(record => matchesDevice(record, next))) return
    const first = sorted.find(item => item.list.records.some(record => matchesDevice(record, next)))
    if (first) setSelectedId(first.list.id)
  }

  function choose(id: string) {
    setSelectedId(id)
    setOpened(true)
    setShowAll(false)
    window.history.replaceState(null, '', `?list=${encodeURIComponent(id)}`)
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <DeviceFilter options={deviceOptions} value={device} label={deviceName} onChange={changeDevice} defaultOpen={initial.menu === 'device'} />
      <div role="radiogroup" aria-label="順位の基準" className="inline-flex h-8 items-center rounded-full border bg-muted/60 p-0.5 text-[13px]">
        {([['accuracy', '正確率', '優先'], ['speed', '速さ', '優先']] as const).map(([value, label, suffix]) =>
          <button key={value} role="radio" aria-checked={order === value} onClick={() => setOrder(value)}
            className={cn('h-full rounded-full px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', order === value ? 'bg-background font-medium shadow-sm dark:bg-input' : 'text-muted-foreground hover:text-foreground')}>{label}<span className="hidden sm:inline">を</span>{suffix}</button>)}
      </div>
      <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        {order === 'accuracy' ? '正確率が高い順。同じ正確率なら速い順' : '速い順。同じ時間なら正確率が高い順'}
      </p>
    </div>

    <div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start xl:gap-6">
      <section aria-label="単語リスト" className={cn('rounded-xl border bg-card xl:sticky xl:top-6', opened && 'hidden xl:block')}>
        <div className="flex items-center gap-2 border-b p-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">リストを検索</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="リストを検索"
              className="h-9 w-full rounded-lg border border-input bg-transparent pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
            {query && <button aria-label="検索をクリア" onClick={() => setQuery('')} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-3.5" aria-hidden="true" /></button>}
          </label>
          <SortMenu value={sort} onChange={setSort} />
        </div>
        {withRecords.length > 0 && <ul className="space-y-0.5 p-1.5">{withRecords.map(item =>
          <ListItem key={item.list.id} item={item} now={now} current={item.list.id === selected?.list.id} onChoose={() => choose(item.list.id)} />)}</ul>}
        {without.length > 0 && <div className="border-t p-1.5">
          <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{device === 'all' ? 'まだ記録のないリスト' : 'この端末の記録がないリスト'}（{without.length}）</p>
          <ul className="space-y-0.5">{without.map(item => <li key={item.list.id}>
            <button onClick={() => choose(item.list.id)} aria-current={item.list.id === selected?.list.id ? 'true' : undefined}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60', item.list.id === selected?.list.id && 'bg-muted text-foreground')}>
              <span className="min-w-0 flex-1 truncate">{item.list.name}</span><span className="shrink-0 text-xs">{item.list.words.length}語</span>
              <ChevronRight className="size-4 shrink-0 xl:hidden" aria-hidden="true" />
            </button>
          </li>)}</ul>
        </div>}
        {!matches.length && <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          <p>「{query}」に一致するリストはありません。</p>
          <Button variant="link" size="sm" onClick={() => setQuery('')}>検索をクリア</Button>
        </div>}
      </section>

      {selected && <section aria-labelledby="ranking-title" className={cn('min-w-0 rounded-xl border bg-card', !opened && 'hidden xl:block')}>
        <Detail item={selected} now={now} order={order} include={include} showAll={showAll} device={device} deviceName={deviceName} devices={devices}
          onInclude={setInclude} onShowAll={setShowAll} onBack={() => { setOpened(false); window.history.replaceState(null, '', '?') }} onResetDevice={() => setDevice('all')} />
      </section>}
    </div>
  </div>
}

function ListItem({ item, now, current, onChoose }: { item: Summary; now: number; current: boolean; onChoose: () => void }) {
  const best = item.best!
  return <li>
    <button onClick={onChoose} aria-current={current ? 'true' : undefined}
      className={cn('relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
        current && 'bg-muted hover:bg-muted before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-foreground')}>
      <span className="truncate text-sm font-medium">{item.list.name}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{item.lastPracticed ? formatDay(item.lastPracticed, new Date(now)) : ''}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] tabular-nums">
        <Trophy className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="font-medium">{formatTime(best.time)}</span>
        <span className="text-muted-foreground">{best.accuracy === undefined ? '' : `${best.accuracy}%`}</span>
        {item.recentBest && <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400"><TrendingUp className="size-3" aria-hidden="true" />更新</span>}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">{item.ranked.length}回<ChevronRight className="size-4 xl:hidden" aria-hidden="true" /></span>
    </button>
  </li>
}

function Detail({ item, now, order, include, showAll, device, deviceName, devices, onInclude, onShowAll, onBack, onResetDevice }: {
  item: Summary; now: number; order: Order; include: boolean; showAll: boolean; device: string; deviceName: string; devices: PracticeDevice[]
  onInclude: (value: boolean) => void; onShowAll: (value: boolean) => void; onBack: () => void; onResetDevice: () => void
}) {
  const { list, ranked, best } = item
  const today = new Date(now)
  const byDate = [...ranked].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const recent = byDate.slice(-5)
  const average = recent.length ? recent.reduce((total, record) => total + record.time, 0) / recent.length : 0
  const accuracies = recent.flatMap(record => record.accuracy === undefined ? [] : [record.accuracy])
  const points = byDate.slice(-20).map(record => ({ date: record.date, value: record.time }))
  const rows = showAll ? ranked : ranked.slice(0, TOP)
  const otherTotal = item.others.length
  const otherText = item.otherCounts.map(({ wordCount, count }) => wordCount === null ? `単語数の記録がない古い記録 ${count}件` : `${wordCount}語の記録 ${count}件`).join('、')

  return <div className="flex flex-col gap-5 p-4 sm:p-6">
    <Button variant="ghost" size="sm" className="-ml-2 self-start xl:hidden" onClick={onBack}><ArrowLeft aria-hidden="true" />リスト一覧</Button>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id="ranking-title" className="text-xl font-bold [overflow-wrap:anywhere]">{list.name}</h2>
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground tabular-nums">
          <span>{list.words.length}語</span><span aria-hidden="true">·</span><span>記録 {list.records.length}回</span>
          {item.lastPracticed && <><span aria-hidden="true">·</span><span>最終練習 {formatDay(item.lastPracticed, today)}</span></>}
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variant="ghost" className="hidden sm:inline-flex" asChild><Link href="/records">記録を見る<ArrowRight aria-hidden="true" /></Link></Button>
        <Button size="lg" className="grow sm:grow-0" asChild><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />このリストを練習</Link></Button>
      </div>
    </div>

    {!ranked.length ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Trophy className="size-5" aria-hidden="true" /></span>
      {device === 'all' ? <>
        <div className="space-y-1"><h3 className="font-bold">まだ練習していません</h3>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">最後まで打つと、このリストの自己ベストと上位の記録がここに並びます。</p></div>
        <Button asChild><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />このリストを練習</Link></Button>
      </> : <>
        <div className="space-y-1"><h3 className="font-bold">「{deviceName}」で練習した記録はありません</h3>
          <p className="max-w-sm text-sm text-balance text-muted-foreground">このリストのほかの端末の記録は {list.records.length}件あります。</p></div>
        <Button variant="outline" onClick={onResetDevice}>すべての端末の記録を表示</Button>
      </>}
    </div> : <>
      <dl className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Tile term="自己ベスト" value={formatTime(best!.time)} note={`${best!.accuracy === undefined ? '正確率なし' : `${best!.accuracy}%`} · ${formatDay(new Date(best!.date), today)}`} highlight />
        <Tile term="直近5回の平均" value={formatTime(average)} note={`ベストとの差 +${(average - best!.time).toFixed(2)} 秒`} />
        <Tile term="平均正確率" value={accuracies.length ? `${(accuracies.reduce((a, b) => a + b, 0) / accuracies.length).toFixed(1)}%` : '—'} note={`直近${recent.length}回`} />
        <Tile term="練習回数" value={`${ranked.length}回`} note={item.fallback || include ? 'すべての単語数' : `今の${list.words.length}語で練習`} />
      </dl>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">所要時間の推移 <span className="font-normal text-muted-foreground">直近{points.length}回</span></h3>
        {points.length > 1 ? <TrendChart label={`${list.name} の所要時間の推移`} points={points} scale={speedScale(points.map(point => point.value))} format={value => formatTime(value)} />
          : <p className="rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">2回以上練習すると推移を表示します。</p>}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">上位の記録 <span className="font-normal text-muted-foreground">{order === 'accuracy' ? '正確率を優先' : '速さを優先'}{device !== 'all' ? ` · ${deviceName}` : ''}</span></h3>
          <span className="text-xs text-muted-foreground tabular-nums">{rows.length} / {ranked.length}件</span>
        </div>
        <RankTable rows={rows} list={list} devices={devices} today={today} />
        <RankCards rows={rows} list={list} devices={devices} today={today} />
        {ranked.length > TOP && <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => onShowAll(!showAll)}>
          {showAll ? '上位5件だけ表示' : `すべて表示（${ranked.length}件）`}<ChevronDown className={cn('transition-transform', showAll && 'rotate-180')} aria-hidden="true" />
        </Button>}
      </div>

      {(otherTotal > 0 || item.fallback) && <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg border border-dashed bg-muted/40 px-3.5 py-3 text-[13px]">
        <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-52 text-muted-foreground">
          {item.fallback ? <>今の{list.words.length}語で練習した記録がないため、単語数が違う記録（{otherText}）で順位を付けています。</>
            : include ? <>単語数が今と違う記録（{otherText}）も含めています。単語数が違うと所要時間は単純に比べられません。</>
              : <><span className="font-medium text-foreground">単語数が今と違う{otherTotal}件は順位に含めていません。</span>リストを編集する前の記録などです（{otherText}）。</>}
        </p>
        {!item.fallback && <Button variant="outline" size="sm" className="ml-6.5 shrink-0 sm:ml-0" onClick={() => onInclude(!include)}>{include ? '含めない' : '含めて表示'}</Button>}
      </div>}
    </>}
  </div>
}

function Tile({ term, value, note, highlight }: { term: string; value: string; note: string; highlight?: boolean }) {
  return <div className={cn('grid min-w-0 content-start gap-0.5 rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5', highlight && 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30')}>
    <dt className="flex items-center gap-1 text-xs text-muted-foreground">{highlight && <Trophy className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />}{term}</dt>
    <dd className="text-xl font-medium tabular-nums sm:text-2xl">{value}</dd>
    <dd className="text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">{note}</dd>
  </div>
}

function RankBadge({ index }: { index: number }) {
  return <span className={cn('grid size-6 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground', index === 0 && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>{index + 1}</span>
}

function deviceText(record: StoredRecord, devices: PracticeDevice[]) {
  if (!record.device) return { name: '—', title: '端末の記録なし', removed: false }
  return { name: record.device.name, title: `${record.device.name}${record.device.layout ? `（${record.device.layout}）` : ''}`, removed: !devices.some(item => item.id === record.device!.id) }
}
function dateText(record: StoredRecord, today: Date) {
  const date = new Date(record.date)
  const day = formatDay(date, today)
  return { text: `${day} ${clock(date)}`, recent: day === '今日' }
}
function WordCountChip({ record, list }: { record: StoredRecord; list: SavedWordList }) {
  if (record.wordCount === list.words.length) return null
  return <span className="ml-1.5 rounded border px-1 text-[11px] font-normal text-muted-foreground" title="単語数が今と違う記録">{record.wordCount ?? '?'}語</span>
}

function RankTable({ rows, list, devices, today }: { rows: StoredRecord[]; list: SavedWordList; devices: PracticeDevice[]; today: Date }) {
  return <table className="hidden w-full table-fixed text-sm tabular-nums sm:table" aria-label={`${list.name} の上位の記録`}>
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b">
        <th scope="col" className="w-12 py-2 pl-2 text-left font-medium">順位</th>
        <th scope="col" className="w-36 py-2 text-left font-medium">所要時間</th>
        <th scope="col" className="w-20 py-2 text-left font-medium">正確率</th>
        <th scope="col" className="w-14 py-2 text-left font-medium">ミス</th>
        <th scope="col" className="py-2 text-left font-medium">端末</th>
        <th scope="col" className="w-32 py-2 pr-2 text-right font-medium">日時</th>
      </tr>
    </thead>
    <tbody>{rows.map((record, index) => {
      const device = deviceText(record, devices)
      const date = dateText(record, today)
      return <tr key={record.id ?? record.date} className={cn('border-b border-border/60 last:border-0', index === 0 && 'bg-amber-50/50 dark:bg-amber-950/20')}>
        <th scope="row" className="py-2.5 pl-2 text-left font-normal"><RankBadge index={index} /></th>
        <td className="py-2.5 font-medium whitespace-nowrap">{formatTime(record.time)}<WordCountChip record={record} list={list} /></td>
        <td className="py-2.5" title={record.accuracy === undefined ? '正確率を記録する前の古い記録です' : undefined}>{record.accuracy === undefined ? '—' : `${record.accuracy}%`}</td>
        <td className="py-2.5 text-muted-foreground">{record.mistakes ?? '—'}</td>
        <td className="py-2.5 pr-3" title={device.title}><span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{device.name}</span>{device.removed && <span className="shrink-0 text-[11px] text-muted-foreground">削除済み</span>}</span></td>
        <td className={cn('py-2.5 pr-2 text-right whitespace-nowrap text-muted-foreground', date.recent && 'font-medium text-green-700 dark:text-green-400')}>{date.text}</td>
      </tr>
    })}</tbody>
  </table>
}

function RankCards({ rows, list, devices, today }: { rows: StoredRecord[]; list: SavedWordList; devices: PracticeDevice[]; today: Date }) {
  return <ol className="divide-y rounded-lg border sm:hidden" aria-label={`${list.name} の上位の記録`}>{rows.map((record, index) => {
    const device = deviceText(record, devices)
    const date = dateText(record, today)
    return <li key={record.id ?? record.date} className={cn('grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 tabular-nums', index === 0 && 'bg-amber-50/50 dark:bg-amber-950/20')}>
      <span className="row-span-2"><RankBadge index={index} /></span>
      <span className="text-[15px] font-medium">{formatTime(record.time)}<WordCountChip record={record} list={list} /></span>
      <span className="text-right text-sm">{record.accuracy === undefined ? '—' : `${record.accuracy}%`}</span>
      <span className="truncate text-xs text-muted-foreground">{device.name}{device.removed ? '（削除済み）' : ''}</span>
      <span className={cn('text-right text-xs text-muted-foreground', date.recent && 'font-medium text-green-700 dark:text-green-400')}>{date.text}</span>
    </li>
  })}</ol>
}

const menuItem = 'relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

function DeviceFilter({ options, value, label, onChange, defaultOpen }: {
  options: { registered: { id: string; label: string; count: number }[]; removed: { id: string; label: string; count: number }[]; none: number; all: number }
  value: string; label: string; onChange: (value: string) => void; defaultOpen?: boolean
}) {
  const option = (id: string, text: string, count: number) => <DropdownMenu.RadioItem key={id} value={id} className={menuItem} disabled={!count}>
    <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
    <span className="min-w-0 flex-1 truncate">{text}</span><span className="text-xs text-muted-foreground tabular-nums">{count}件</span>
  </DropdownMenu.RadioItem>
  return <DropdownMenu.Root defaultOpen={defaultOpen} modal={false}>
    <DropdownMenu.Trigger className={cn('inline-flex h-8 max-w-60 items-center gap-1.5 rounded-full border bg-background px-3 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
      value !== 'all' && 'border-foreground/30 bg-muted font-medium')}>
      <Keyboard className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">端末：{label}</span><ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">練習した端末で絞り込む</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
          {option('all', 'すべての端末', options.all)}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {options.registered.map(item => option(item.id, item.label, item.count))}
          {options.removed.length > 0 && <DropdownMenu.Label className="px-2 pt-2 pb-1 text-xs text-muted-foreground">削除した端末</DropdownMenu.Label>}
          {options.removed.map(item => option(item.id, item.label, item.count))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {option('none', '端末の記録なし', options.none)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (value: SortKey) => void }) {
  const labels: Record<SortKey, string> = { recent: '最近練習した順', name: '名前順', count: '記録が多い順' }
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger aria-label={`並び順：${labels[value]}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
      {labels[value]}<ChevronDown className="size-3.5" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.RadioGroup value={value} onValueChange={next => onChange(next as SortKey)}>
          {(Object.keys(labels) as SortKey[]).map(key => <DropdownMenu.RadioItem key={key} value={key} className={menuItem}>
            <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>{labels[key]}
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}

function EmptyState() {
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-12 text-center sm:py-16">
    <span className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Trophy className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 className="font-bold">まだベスト記録がありません</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">単語リストを最後まで打つと、リストごとの自己ベストと上位の記録、所要時間の推移がここに並びます。</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="lg" asChild><Link href="/play"><Keyboard aria-hidden="true" />練習する</Link></Button>
      <Button size="lg" variant="outline" asChild><Link href="/create"><Plus aria-hidden="true" />単語リストを作る</Link></Button>
    </div>
  </div>
}

function LoadingState() {
  return <div role="status" className="space-y-4">
    <span className="sr-only">読み込み中…</span>
    <div className="flex gap-2"><Skeleton className="h-8 w-36 rounded-full" /><Skeleton className="h-8 w-52 rounded-full" /></div>
    <div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-6">
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-1.5 px-1 py-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3.5 w-1/2" /></div>)}
      </div>
      <div className="hidden space-y-5 rounded-xl border bg-card p-6 xl:block">
        <Skeleton className="h-7 w-1/3" />
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    </div>
  </div>
}
