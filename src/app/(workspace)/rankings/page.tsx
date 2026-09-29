"use client"
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { RadioGroup } from "radix-ui"
import { CircleAlert, HardDrive, Info, Keyboard, Plus, RotateCw, Trophy } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import FilterMenu from "@/components/Records/FilterMenu"
import RankingDetail, { ORDER_NOTES } from "@/components/Rankings/RankingDetail"
import RankingList from "@/components/Rankings/RankingList"
import { GUEST_ACCOUNT_ID } from "@/lib/guestWorkspace"
import { useWordLists } from "@/lib/useWordLists"
import type { PracticeDevice } from "@/lib/devices"
import { deviceOptions, matchesDevice, NO_DEVICE, type RankOrder } from "@/lib/records"
import { listRanking, sortRankings, type ListSort } from "@/lib/rankings"
import type { SavedWordList } from "@/lib/wordLists"
import { cn } from "@/lib/utils"

// Matches Tailwind's `xl`, where the list and the detail sit side by side.
const WIDE = '(min-width: 80rem)'

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false)
}

export default function Rankings() {
  const workspace = useWordLists()
  const practised = workspace.lists.some(list => list.records.length)
  return <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">ベスト記録</h1>
        <p className="text-sm text-muted-foreground">単語リストごとの自己ベストです。リストを選ぶと、上位の記録と所要時間の推移を表示します。</p>
      </div>
      {workspace.ready && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
        title={workspace.accountId === GUEST_ACCOUNT_ID ? '未ログインのため、このブラウザーのLocalStorageに保存します。' : 'ログイン中のアカウントに保存します。'}>
        <HardDrive className="size-3.5" aria-hidden="true" />{workspace.accountId === GUEST_ACCOUNT_ID ? 'このブラウザーに保存' : 'アカウントに保存'}
      </span>}
    </header>
    {workspace.error && <Alert variant="destructive" className="mb-6 border-destructive/40 bg-destructive/5">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-64">{workspace.error}</span>
        <Button variant="outline" size="lg" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" />再読み込み</Button>
      </AlertDescription>
    </Alert>}
    {!workspace.ready ? <LoadingState />
      : practised ? <Suspense fallback={<LoadingState />}><RankingsView key={workspace.accountId} lists={workspace.lists} devices={workspace.devices} /></Suspense>
        // After a failed load there is nothing to show, and "no records yet" would be wrong.
        : !workspace.error && <EmptyState />}
  </main>
}

type View = { list: string | null; device: string | null; order: RankOrder }

// `?list=<id>&device=<id>&order=speed` keep the view in the URL, so other screens can open one list's ranking.
// Below `xl`, opening a list pushes a history entry, so the browser's back button returns to the list.
function RankingsView({ lists, devices }: { lists: SavedWordList[]; devices: PracticeDevice[] }) {
  const params = useSearchParams()
  const [now] = useState(() => new Date())
  const [sort, setSort] = useState<ListSort>('recent')
  const wide = useWide()
  const pushed = useRef(false)
  // Where focus goes once the view has switched: the detail heading, or the list that was just closed.
  const focusAfter = useRef<{ detail: true } | { list: string } | null>(null)

  const devicesOptions = useMemo(() => deviceOptions(lists.flatMap(list => list.records)).map(option =>
    option.value === NO_DEVICE || devices.some(device => device.id === option.value) ? option : { ...option, label: `${option.label}（削除済み）` }), [lists, devices])
  const device = devicesOptions.some(option => option.value === params.get('device')) ? params.get('device') : null
  const order: RankOrder = params.get('order') === 'speed' ? 'speed' : 'accuracy'
  const rankings = useMemo(() => sortRankings(lists.map(list => listRanking(list, { device, order, now })), sort), [lists, device, order, now, sort])
  const requested = lists.find(list => list.id === params.get('list'))
  // On wide screens something is always open: the most recent list with a record, like the top of the list.
  const selected = requested ?? rankings.find(item => item.ranked.length)?.list ?? rankings[0]?.list
  const opened = Boolean(requested)
  const deviceName = devicesOptions.find(option => option.value === device)?.label ?? ''

  useEffect(() => {
    const target = focusAfter.current
    focusAfter.current = null
    if (target && 'detail' in target) document.getElementById('ranking-title')?.focus()
    if (target && 'list' in target) document.querySelector<HTMLElement>(`[data-ranking-list] [data-list-id="${CSS.escape(target.list)}"]`)?.focus()
  }, [opened])

  function navigate(next: Partial<View>, mode: 'push' | 'replace' = 'replace') {
    const view = { list: requested?.id ?? null, device, order, ...next }
    const query = new URLSearchParams()
    if (view.list) query.set('list', view.list)
    if (view.device) query.set('device', view.device)
    if (view.order === 'speed') query.set('order', 'speed')
    const url = `${window.location.pathname}${query.size ? `?${query}` : ''}`
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }

  function choose(id: string) {
    if (wide) return navigate({ list: id })
    focusAfter.current = { detail: true }
    pushed.current = true
    navigate({ list: id }, 'push')
    window.scrollTo({ top: 0 })
  }

  function back() {
    if (requested) focusAfter.current = { list: requested.id }
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else navigate({ list: null })
  }

  // Keep the detail useful after filtering: on wide screens, move to a list that has records on that device.
  function changeDevice(next: string | null) {
    const keep = !requested || !wide || requested.records.some(record => matchesDevice(record, next))
    navigate({ device: next, list: keep ? requested?.id ?? null : null })
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu name="端末" allLabel="すべての端末" value={device} options={devicesOptions} onChange={changeDevice} />
      <OrderToggle value={order} onChange={value => navigate({ order: value })} />
      <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />{ORDER_NOTES[order]}
      </p>
    </div>

    <div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start xl:gap-6">
      <section aria-label="単語リスト" data-ranking-list className={cn('rounded-xl border bg-card xl:sticky xl:top-6', opened && 'hidden xl:block')}>
        <RankingList rankings={rankings} selectedId={opened || wide ? selected?.id : undefined} filtered={device !== null} sort={sort} onSort={setSort} now={now} onChoose={choose} />
      </section>
      {selected && <section aria-labelledby="ranking-title" className={cn('min-w-0 rounded-xl border bg-card', !opened && 'hidden xl:block')}>
        <RankingDetail key={selected.id} list={selected} devices={devices} device={device} deviceName={deviceName} order={order} now={now}
          onBack={back} onShowAllDevices={() => navigate({ device: null })} />
      </section>}
    </div>
  </div>
}

function OrderToggle({ value, onChange }: { value: RankOrder; onChange: (value: RankOrder) => void }) {
  return <RadioGroup.Root value={value} onValueChange={next => onChange(next as RankOrder)} aria-label="順位の基準" orientation="horizontal"
    className="inline-flex h-9 items-center rounded-full border bg-muted/60 p-0.5 text-[13px]">
    {([['accuracy', '正確率'], ['speed', '速さ']] as const).map(([option, label]) =>
      <RadioGroup.Item key={option} value={option}
        className="h-full rounded-full px-3 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:bg-input">
        {label}<span className="hidden sm:inline">を</span>優先
      </RadioGroup.Item>)}
  </RadioGroup.Root>
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
    <div className="flex gap-2"><Skeleton className="h-9 w-36 rounded-full" /><Skeleton className="h-9 w-52 rounded-full" /></div>
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
