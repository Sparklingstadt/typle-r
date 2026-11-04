"use client"
import { useTranslations } from "next-intl"
import { ClearableSearchField } from "@/components/ui/search-field"
import { Button } from "@/components/ui/button"
import LabelFilter from "@/components/WordLists/LabelFilter"
import OrderMenu from "@/components/WordLists/OrderMenu"
import { isFiltered, NO_FILTER, type ListFilter, type ListOrder, type Labels } from "@/core/listOverview"


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
    <ClearableSearchField value={query} onChange={onQueryChange} label={t('manager.search')} clearLabel={t('manager.clearSearch')}
      className="basis-60 sm:max-w-sm" inputClassName="bg-background" />
    <LabelFilter labels={labels} value={filter} onChange={onFilterChange} />
    <OrderMenu value={order} onChange={onOrderChange} />
    {isFiltered(filter) && <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={() => onFilterChange(NO_FILTER)}>{t('filter.clear')}</Button>}
    <p aria-live="polite" className="ml-auto text-sm text-muted-foreground tabular-nums">{narrowed ? t('manager.countFiltered', { shown: shownCount, total: totalCount }) : t('manager.count', { total: totalCount })}</p>
  </div>
}
