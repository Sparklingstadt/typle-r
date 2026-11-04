"use client"
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Search, TrendingUp, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFormat } from '@/i18n/useFormat'
import { formatAccuracy } from '@/core/records'
import { IMPROVED_DAYS, LIST_SORTS, type ListRanking, type ListSort } from '@/core/rankings'
import { levelName } from '@/core/listOverview'
import { matchesRankingQuery, type PackRanking } from '@/core/packRecords'
import PracticeName, { usePracticeName } from '@/components/PracticeName'
import { cn } from '@/lib/utils'
import { RecordTime } from '@/components/Records/RecordRow'

// Packs without a (matching) record are grouped below, so they can still be opened and practised: a pack of one list shows that list,
// a pack of several collapses to one button that opens its first list.
// `packs` arrive sorted, so the page can open the first list shown here.
export default function RankingList({ packs, selectedId, filtered, sort, onSort, now, onChoose }: {
  packs: PackRanking[]
  selectedId: string | undefined
  filtered: boolean
  sort: ListSort
  onSort: (sort: ListSort) => void
  now: Date
  onChoose: (id: string) => void
}) {
  const t = useTranslations('rankings.list')
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''
  // The lists that match, per pack; a pack stays when any of its lists does.
  const matches = packs.flatMap(item => {
    const ids = searching ? new Set(matchesRankingQuery(item, query)) : null
    const rows = ids ? item.items.filter(ranking => ids.has(ranking.list.id)) : item.items
    return rows.length ? [{ item, rows }] : []
  })
  const practised = matches.filter(({ item }) => item.items.some(ranking => ranking.ranked.length))
  const unpractised = matches.filter(({ item }) => !item.items.some(ranking => ranking.ranked.length))
  return <>
    <div className="flex items-center gap-2 border-b p-3">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t('search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')}
          className="h-9 w-full rounded-lg border border-input bg-transparent pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden" />
        {query && <button type="button" aria-label={t('clearSearch')} onClick={() => setQuery('')}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          <X className="size-3.5" aria-hidden="true" />
        </button>}
      </label>
      <SortMenu value={sort} onChange={onSort} />
    </div>
    {practised.length > 0 && <ul className="space-y-0.5 p-1.5">
      {practised.map(({ item, rows }) => item.items.length === 1
        ? <PracticedRow key={item.pack.id} ranking={rows[0]} now={now} selectedId={selectedId} onChoose={onChoose} />
        : <li key={item.pack.id} data-pack-id={item.pack.id} className="py-1">
          <PackHeading item={item} now={now} />
          <ul className="space-y-0.5">{rows.map(ranking => <PracticedRow key={ranking.list.id} ranking={ranking} now={now} selectedId={selectedId} onChoose={onChoose} grouped />)}</ul>
        </li>)}
    </ul>}
    {unpractised.length > 0 && <div className={cn('p-1.5', practised.length > 0 && 'border-t')}>
      <h2 className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{t(filtered ? 'noDeviceRecords' : 'noRecords', { count: unpractised.reduce((total, { rows }) => total + rows.length, 0) })}</h2>
      <ul className="space-y-0.5">{unpractised.map(({ item, rows }) => <UnpractisedRow key={item.pack.id} item={item} rows={rows} selectedId={selectedId} onChoose={onChoose} />)}</ul>
    </div>}
    {!matches.length && <div className="px-4 py-8 text-center text-sm text-muted-foreground">
      <p className="[overflow-wrap:anywhere]">{t('noMatch', { query: query.trim() })}</p>
      <Button variant="link" size="sm" onClick={() => setQuery('')}>{t('clearSearch')}</Button>
    </div>}
  </>
}

// The pack's name with its totals: runs, practised lists, the last practice and the lists whose best is new.
function PackHeading({ item, now }: { item: PackRanking; now: Date }) {
  const t = useTranslations('rankings.list')
  const format = useFormat()
  const totals = [
    t('runs', { count: item.practiceCount }),
    t('packPracticed', { practiced: item.practicedListCount, lists: item.items.length }),
    ...(item.lastPracticed ? [format.day(item.lastPracticed, now)] : []),
    ...(item.improvedCount ? [t('packImproved', { count: item.improvedCount })] : []),
  ]
  return <div className="px-2.5 pt-1.5 pb-1">
    <h2 className="text-sm font-medium [overflow-wrap:anywhere]">{item.pack.name}</h2>
    <p className="text-xs text-muted-foreground tabular-nums">{totals.join(t('packJoin'))}</p>
  </div>
}

// A list with no record in a pack that has some looks like the lists of a pack without any.
function PracticedRow({ ranking, now, selectedId, onChoose, grouped }: {
  ranking: ListRanking; now: Date; selectedId: string | undefined; onChoose: (id: string) => void; grouped?: boolean
}) {
  return ranking.ranked.length
    ? <ListItem item={ranking} now={now} current={ranking.list.id === selectedId} grouped={grouped} onChoose={() => onChoose(ranking.list.id)} />
    : <li><EmptyButton ranking={ranking} selectedId={selectedId} onChoose={onChoose} grouped={grouped} /></li>
}

// A pack of one list is its list; a pack of several opens its first matching list.
function UnpractisedRow({ item, rows, selectedId, onChoose }: { item: PackRanking; rows: ListRanking[]; selectedId: string | undefined; onChoose: (id: string) => void }) {
  const t = useTranslations('rankings.list')
  if (item.items.length === 1) return <li><EmptyButton ranking={rows[0]} selectedId={selectedId} onChoose={onChoose} /></li>
  const current = item.items.some(ranking => ranking.list.id === selectedId)
  const words = item.items.reduce((total, ranking) => total + ranking.list.words.length, 0)
  const name = t('packLists', { pack: item.pack.name, count: item.items.length })
  return <li data-pack-id={item.pack.id}>
    <button type="button" data-list-id={rows[0].list.id} onClick={() => onChoose(rows[0].list.id)} aria-current={current ? 'true' : undefined}
      className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50', current && 'bg-muted text-foreground')}>
      <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]" title={name}>{name}</span>
      <span className="shrink-0 text-xs tabular-nums">{t('words', { count: words })}</span>
      <ChevronRight className="size-4 shrink-0 xl:hidden" aria-hidden="true" />
    </button>
  </li>
}

function EmptyButton({ ranking, selectedId, onChoose, grouped }: { ranking: ListRanking; selectedId: string | undefined; onChoose: (id: string) => void; grouped?: boolean }) {
  const t = useTranslations('rankings.list')
  const practiceName = usePracticeName()
  const { list } = ranking
  return <button type="button" data-list-id={list.id} onClick={() => onChoose(list.id)} aria-current={list.id === selectedId ? 'true' : undefined}
    className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
      list.id === selectedId && 'bg-muted text-foreground')}>
    <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]" title={practiceName(list)}>{grouped ? levelName(list) : <PracticeName list={list} />}</span>
    <span className="shrink-0 text-xs tabular-nums">{t('words', { count: list.words.length })}</span>
    <ChevronRight className="size-4 shrink-0 xl:hidden" aria-hidden="true" />
  </button>
}

function ListItem({ item, now, current, grouped, onChoose }: { item: ListRanking; now: Date; current: boolean; grouped?: boolean; onChoose: () => void }) {
  const t = useTranslations('rankings.list')
  const format = useFormat()
  const practiceName = usePracticeName()
  const best = item.best!
  return <li>
    <button type="button" data-list-id={item.list.id} onClick={onChoose} aria-current={current ? 'true' : undefined}
      className={cn('relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
        current && 'bg-muted before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-foreground hover:bg-muted')}>
      <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={practiceName(item.list)}>{grouped ? levelName(item.list) : <PracticeName list={item.list} />}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{item.lastPracticed && <><span className="sr-only">{t('lastPracticed')} </span>{format.day(item.lastPracticed, now)}</>}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] tabular-nums">
        <Trophy className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="sr-only">{t('best')} </span><RecordTime seconds={best.time} className="font-medium" />
        <span className="text-muted-foreground">{formatAccuracy(best.accuracy)}</span>
        {item.improved && <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400" title={t('improvedTitle', { days: IMPROVED_DAYS })}>
          <TrendingUp className="size-3" aria-hidden="true" />{t('improved')}
        </span>}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">{t('runs', { count: item.records.length })}<ChevronRight className="size-4 xl:hidden" aria-hidden="true" /></span>
    </button>
  </li>
}

function SortMenu({ value, onChange }: { value: ListSort; onChange: (value: ListSort) => void }) {
  const t = useTranslations('rankings.list')
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={t('sortLabel', { sort: t(`sorts.${value}`) })}
      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted">
      {t(`sorts.${value}`)}<ChevronDown className="size-3.5" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={6} className="w-44">
      <DropdownMenuRadioGroup value={value} onValueChange={next => onChange(next as ListSort)}>
        {LIST_SORTS.map(key => <DropdownMenuRadioItem key={key} value={key}>
          {t(`sorts.${key}`)}
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
