"use client"
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type FilterOption = { value: string; label: string; count: number }

const ALL = 'all'

// A pill that reads as the current filter ("リスト：Test 1") and opens the choices with their record counts.
export default function FilterMenu({ name, allLabel, value, options, onChange }: {
  name: string
  allLabel: string
  value: string | null
  options: FilterOption[]
  onChange: (value: string | null) => void
}) {
  const t = useTranslations('records.filterMenu')
  const current = options.find(option => option.value === value)
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={t('label', { name, current: current?.label ?? allLabel })}
      className={cn('inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background px-3.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30',
        current && 'border-foreground/25 bg-secondary font-medium dark:bg-secondary')}>
      <span className="shrink-0 text-muted-foreground">{name}</span>
      <span className="truncate">{current?.label ?? t('all')}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={6} className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
      <DropdownMenuRadioGroup value={value ?? ALL} onValueChange={next => onChange(next === ALL ? null : next)}>
        {[{ value: ALL, label: allLabel, count: options.reduce((total, option) => total + option.count, 0) }, ...options].map(option =>
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t('count', { count: option.count })}</span>
          </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
