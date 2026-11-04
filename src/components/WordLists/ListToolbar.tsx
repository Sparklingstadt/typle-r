"use client"
import { useTranslations } from "next-intl"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import LabelFilter from "@/components/WordLists/LabelFilter"
import OrderMenu from "@/components/WordLists/OrderMenu"
import { isFiltered, NO_FILTER, type ListFilter, type ListOrder, type listLabels } from "@/core/listOverview"

type Labels = ReturnType<typeof listLabels>

export default function ListToolbar({ query, onQueryChange, labels, filter, onFilterChange, order, onOrderChange, shownCount, totalCount, narrowed }: {
  query: string
  onQueryChange: (query: string) => void
  labels: Labels
  filter: ListFilter
  onFilterChange: (filter: ListFilter) => void
  order: ListOrder
  onOrderChange: (order: ListOrder) => void
  shownCount: number
  totalCount: number
  narrowed: boolean
}) {
  const t = useTranslations('wordLists')
  return <div className="flex flex-wrap items-center gap-2">
    <label className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
      <span className="sr-only">{t('manager.search')}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder={t('manager.search')}
        className="h-10 w-full rounded-lg border border-input bg-background pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden" />
      {query && <button type="button" aria-label={t('manager.clearSearch')} onClick={() => onQueryChange('')}
        className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        <X className="size-3.5" aria-hidden="true" />
      </button>}
    </label>
    <LabelFilter labels={labels} value={filter} onChange={onFilterChange} />
    <OrderMenu value={order} onChange={onOrderChange} />
    {isFiltered(filter) && <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => onFilterChange(NO_FILTER)}>{t('filter.clear')}</Button>}
    <p aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums">{narrowed ? t('manager.countFiltered', { shown: shownCount, total: totalCount }) : t('manager.count', { total: totalCount })}</p>
  </div>
}
