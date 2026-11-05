"use client"
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { RadioGroup } from "radix-ui"
import { Info, Keyboard, Plus, RotateCw, Trophy } from "lucide-react"
import { ErrorAlert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import FilterMenu from "@/components/Records/FilterMenu"
import RankingDetail from "@/components/Rankings/RankingDetail"
import RankingList from "@/components/Rankings/RankingList"
import ModeToggle from "@/components/Practice/ModeToggle"
import { useFormat } from "@/i18n/useFormat"
import { useWordLists } from "@/lib/useWordLists"
import { deviceExists, type PracticeDevice } from "@/core/devices"
import { deviceOptions, matchesDevice, NO_DEVICE, PRACTICE_MODES, recordsOfMode, type PracticeMode, type RankOrder } from "@/core/records"
import { listRanking, rankingQuery, type ListSort, type RankingView } from "@/core/rankings"
import { packRankings, sortPackRankings } from "@/core/packRecords"
import type { SavedWordList } from "@/core/wordLists"
import type { WordPack } from "@/core/wordPacks"
import { cn } from "@/lib/utils"
import PageStorageBadge from "@/components/PageStorageBadge"
import { PageHeader, PageMain } from "@/components/ui/page-layout"

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
  const t = useTranslations('rankings')
  const workspace = useWordLists()
  const practised = workspace.lists.some(list => list.records.length)
  return <PageMain width="wide">
    <PageHeader title={t('title')} description={t('intro')}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6" action={<Button variant="outline" size="lg" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" />{t('reload')}</Button>}>{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <LoadingState />
      : practised ? <Suspense fallback={<LoadingState />}><RankingsView key={workspace.accountId} lists={workspace.lists} packs={workspace.packs} devices={workspace.devices} /></Suspense>
        // After a failed load there is nothing to show, and "no records yet" would be wrong.
        : !workspace.error && <NoRankings />}
  </PageMain>
}

type View = RankingView

// `?list=<id>&device=<id>&order=speed&mode=recall` (or `mode=writing`) keep the view in the URL, so other screens can open one list's ranking.
// Below `xl`, opening a list pushes a history entry, so the browser's back button returns to the list.
function RankingsView({ lists, packs, devices }: { lists: SavedWordList[]; packs: WordPack[]; devices: PracticeDevice[] }) {
  const t = useTranslations('rankings')
  const modes = useTranslations('rankings.mode')
  const format = useFormat()
  const locale = useLocale()
  const params = useSearchParams()
  const [now] = useState(() => new Date())
  const [sort, setSort] = useState<ListSort>('recent')
  const wide = useWide()
  const pushed = useRef(false)
  // Where focus goes once the view has switched: the detail heading, or the list that was just closed.
  const focusAfter = useRef<{ detail: true } | { list: string; pack?: string } | null>(null)

  const devicesOptions = useMemo(() => deviceOptions(lists.flatMap(list => list.records)).map(({ value, device, count }) => {
    const label = format.recordDevice(device)
    return { value, count, label: value === NO_DEVICE || deviceExists(devices, value) ? label : t('filter.deleted', { name: label }) }
  }), [lists, devices, format, t])
  const device = devicesOptions.some(option => option.value === params.get('device')) ? params.get('device') : null
  const order: RankOrder = params.get('order') === 'speed' ? 'speed' : 'accuracy'
  // Normal, recall and handwriting runs are ranked apart.
  const mode: PracticeMode = PRACTICE_MODES.find(value => value !== 'normal' && value === params.get('mode')) ?? 'normal'
  const packRanks = useMemo(() => sortPackRankings(packRankings(packs, lists.map(list => listRanking(list, { device, order, now, mode }))), sort, locale), [lists, packs, device, order, mode, now, sort, locale])
  const requested = lists.find(list => list.id === params.get('list'))
  // On wide screens something is always open: the most recent list with a record in the first pack with one, like the top of the list.
  const firstPack = packRanks.find(item => item.items.some(ranking => ranking.ranked.length)) ?? packRanks[0]
  const recent = firstPack?.items.filter(ranking => ranking.ranked.length).reduce<typeof firstPack.items[number] | undefined>(
    (latest, ranking) => !latest || (ranking.lastPracticed?.getTime() ?? 0) > (latest.lastPracticed?.getTime() ?? 0) ? ranking : latest, undefined)
  const selected = requested ?? (recent ?? firstPack?.items[0])?.list
  const opened = Boolean(requested)
  const deviceName = devicesOptions.find(option => option.value === device)?.label ?? ''

  useEffect(() => {
    const target = focusAfter.current
    focusAfter.current = null
    if (target && 'detail' in target) document.getElementById('ranking-title')?.focus()
    // A list collapsed into its pack's button has no row of its own, so the focus falls back to the pack's row.
    if (target && 'list' in target) {
      const root = document.querySelector('[data-ranking-list]')
      const row = root?.querySelector<HTMLElement>(`[data-list-id="${CSS.escape(target.list)}"]`)
        ?? (target.pack ? root?.querySelector<HTMLElement>(`[data-pack-id="${CSS.escape(target.pack)}"] button`) : null)
      row?.focus()
    }
  }, [opened])

  function navigate(next: Partial<View>, history: 'push' | 'replace' = 'replace') {
    const query = rankingQuery({ list: requested?.id ?? null, device, order, mode, ...next })
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`
    if (history === 'push') window.history.pushState(null, '', url)
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
    if (requested) focusAfter.current = { list: requested.id, pack: requested.packId }
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else navigate({ list: null })
  }

  // Keep the detail useful after filtering: on wide screens, move to a list that has records on that device.
  function changeDevice(next: string | null) {
    // Only the chosen mode's records count: a list with none of them on that device is closed.
    const keep = !requested || !wide || recordsOfMode(requested.records, mode).some(record => matchesDevice(record, next))
    navigate({ device: next, list: keep ? requested?.id ?? null : null })
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu name={t('filter.device')} allLabel={t('filter.allDevices')} value={device} options={devicesOptions} onChange={changeDevice} />
      <ModeToggle options={PRACTICE_MODES} value={mode} onChange={value => navigate({ mode: value })} label={modes('label')} labels={{ normal: modes('normal'), recall: modes('recall'), writing: modes('writing') }} />
      <OrderToggle value={order} onChange={value => navigate({ order: value })} />
      <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />{t(`orderNotes.${order}`)}
      </p>
    </div>

    <div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start xl:gap-6">
      <section aria-label={t('lists')} data-ranking-list className={cn('rounded-xl border bg-card xl:sticky xl:top-6', opened && 'hidden xl:block')}>
        <RankingList packs={packRanks} selectedId={opened || wide ? selected?.id : undefined} filtered={device !== null} sort={sort} onSort={setSort} now={now} onChoose={choose} />
      </section>
      {selected && <section aria-labelledby="ranking-title" className={cn('min-w-0 rounded-xl border bg-card', !opened && 'hidden xl:block')}>
        <RankingDetail key={selected.id} list={selected} devices={devices} device={device} deviceName={deviceName} order={order} mode={mode} now={now}
          onBack={back} onShowAllDevices={() => navigate({ device: null })} />
      </section>}
    </div>
  </div>
}

function OrderToggle({ value, onChange }: { value: RankOrder; onChange: (value: RankOrder) => void }) {
  const t = useTranslations('rankings.order')
  return <RadioGroup.Root value={value} onValueChange={next => onChange(next as RankOrder)} aria-label={t('label')} orientation="horizontal"
    className="inline-flex h-9 items-center rounded-full border bg-muted/60 p-0.5 text-[13px]">
    {(['accuracy', 'speed'] as const).map(option =>
      <RadioGroup.Item key={option} value={option}
        className="h-full rounded-full px-3 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:bg-input">
        {t.rich(option, { wide: chunks => <span className="hidden sm:inline">{chunks}</span> })}
      </RadioGroup.Item>)}
  </RadioGroup.Root>
}

function NoRankings() {
  const t = useTranslations('rankings.empty')
  return <EmptyState className="py-12 sm:py-16">
    <span className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Trophy className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('description')}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="lg" asChild><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
      <Button size="lg" variant="outline" asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('create')}</Link></Button>
    </div>
  </EmptyState>
}

function LoadingState() {
  const common = useTranslations('common')
  return <div role="status" className="space-y-4">
    <span className="sr-only">{common('loading')}</span>
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
