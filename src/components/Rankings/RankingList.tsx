"use client"
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DropdownMenu } from 'radix-ui'
import { Check, ChevronDown, ChevronRight, Search, TrendingUp, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/i18n/useFormat'
import { formatAccuracy } from '@/lib/records'
import { IMPROVED_DAYS, LIST_SORTS, type ListRanking, type ListSort } from '@/lib/rankings'
import { cn } from '@/lib/utils'
import { RecordTime } from '@/components/Records/RecordRow'

const menuItem = 'relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

// Every list stays reachable: lists without a (matching) record are grouped below, so they can still be opened and practised.
// `rankings` arrive sorted, so the page can open the first list shown here.
export default function RankingList({ rankings, selectedId, filtered, sort, onSort, now, onChoose }: {
  rankings: ListRanking[]
  selectedId: string | undefined
  filtered: boolean
  sort: ListSort
  onSort: (sort: ListSort) => void
  now: Date
  onChoose: (id: string) => void
}) {
  const t = useTranslations('rankings.list')
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const matches = rankings.filter(item => item.list.name.toLocaleLowerCase().includes(needle))
  const practised = matches.filter(item => item.ranked.length)
  const unpractised = matches.filter(item => !item.ranked.length)
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
      {practised.map(item => <ListItem key={item.list.id} item={item} now={now} current={item.list.id === selectedId} onChoose={() => onChoose(item.list.id)} />)}
    </ul>}
    {unpractised.length > 0 && <div className={cn('p-1.5', practised.length > 0 && 'border-t')}>
      <h2 className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{t(filtered ? 'noDeviceRecords' : 'noRecords', { count: unpractised.length })}</h2>
      <ul className="space-y-0.5">{unpractised.map(item => <li key={item.list.id}>
        <button type="button" data-list-id={item.list.id} onClick={() => onChoose(item.list.id)} aria-current={item.list.id === selectedId ? 'true' : undefined}
          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
            item.list.id === selectedId && 'bg-muted text-foreground')}>
          <span className="min-w-0 flex-1 truncate">{item.list.name}</span>
          <span className="shrink-0 text-xs tabular-nums">{t('words', { count: item.list.words.length })}</span>
          <ChevronRight className="size-4 shrink-0 xl:hidden" aria-hidden="true" />
        </button>
      </li>)}</ul>
    </div>}
    {!matches.length && <div className="px-4 py-8 text-center text-sm text-muted-foreground">
      <p className="[overflow-wrap:anywhere]">{t('noMatch', { query: query.trim() })}</p>
      <Button variant="link" size="sm" onClick={() => setQuery('')}>{t('clearSearch')}</Button>
    </div>}
  </>
}

function ListItem({ item, now, current, onChoose }: { item: ListRanking; now: Date; current: boolean; onChoose: () => void }) {
  const t = useTranslations('rankings.list')
  const format = useFormat()
  const best = item.best!
  return <li>
    <button type="button" data-list-id={item.list.id} onClick={onChoose} aria-current={current ? 'true' : undefined}
      className={cn('relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
        current && 'bg-muted before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-foreground hover:bg-muted')}>
      <span className="truncate text-sm font-medium">{item.list.name}</span>
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
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger aria-label={t('sortLabel', { sort: t(`sorts.${value}`) })}
      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted">
      {t(`sorts.${value}`)}<ChevronDown className="size-3.5" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.RadioGroup value={value} onValueChange={next => onChange(next as ListSort)}>
          {LIST_SORTS.map(key => <DropdownMenu.RadioItem key={key} value={key} className={menuItem}>
            <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
            {t(`sorts.${key}`)}
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
