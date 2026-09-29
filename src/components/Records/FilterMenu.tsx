"use client"
import { DropdownMenu } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FilterOption = { value: string; label: string; count: number }

const item = 'relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'
const ALL = 'all'

// A pill that reads as the current filter ("リスト：Test 1") and opens the choices with their record counts.
export default function FilterMenu({ name, allLabel, value, options, onChange }: {
  name: string
  allLabel: string
  value: string | null
  options: FilterOption[]
  onChange: (value: string | null) => void
}) {
  const current = options.find(option => option.value === value)
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger aria-label={`${name}で絞り込む（現在：${current?.label ?? allLabel}）`}
      className={cn('inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background px-3.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30',
        current && 'border-foreground/25 bg-secondary font-medium dark:bg-secondary')}>
      <span className="shrink-0 text-muted-foreground">{name}</span>
      <span className="truncate">{current?.label ?? 'すべて'}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={6} className="z-50 max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.RadioGroup value={value ?? ALL} onValueChange={next => onChange(next === ALL ? null : next)}>
          {[{ value: ALL, label: allLabel, count: options.reduce((total, option) => total + option.count, 0) }, ...options].map(option =>
            <DropdownMenu.RadioItem key={option.value} value={option.value} className={item}>
              <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{option.count}回</span>
            </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
