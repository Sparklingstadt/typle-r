"use client"
import { useTranslations } from 'next-intl'
import { ChevronDown, Folder, Tag } from 'lucide-react'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ListFilter, Labels } from '@/core/listOverview'
import { cn } from '@/lib/utils'


const trigger = 'inline-flex h-10 max-w-full shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30'
const content = 'max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto'
// Radio values: every category, one category by name, or the lists without one.
const ALL = 'all'
const NONE = 'none'
const named = (name: string) => `category:${name}`

function Count({ value }: { value: number }) {
  return <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums">{value}</span>
}

// Narrows the lists down by category (one) and tags (every one chosen). Each menu is left out while no list has any.
export default function LabelFilter({ labels, value, onChange }: { labels: Labels; value: ListFilter; onChange: (value: ListFilter) => void }) {
  const t = useTranslations('wordLists.filter')
  const key = (name: string) => name.toLocaleLowerCase()
  // A chosen tag stays in the menu, so it can be unchecked, even when no list has it any more.
  const tags = [...labels.tags, ...value.tags.filter(tag => !labels.tags.some(item => key(item.name) === key(tag))).map(name => ({ name, count: 0 }))]
  const category = value.category === null ? ALL : value.category === '' ? NONE : named(labels.categories.find(item => key(item.name) === key(value.category ?? ''))?.name ?? value.category)
  const categoryText = value.category === null ? t('allCategories') : value.category === '' ? t('noCategory') : value.category
  return <>
    {(labels.categories.length > 0 || value.category !== null) && <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('categoryCurrent', { category: categoryText })} className={cn(trigger, value.category !== null && 'border-primary/60')}>
        <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{categoryText}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className={content}>
        <DropdownMenuRadioGroup value={category} onValueChange={next =>
          onChange({ ...value, category: next === ALL ? null : next === NONE ? '' : next.slice(named('').length) })}>
          {[{ id: ALL, text: t('allCategories'), count: undefined as number | undefined }, ...labels.categories.map(item => ({ id: named(item.name), text: item.name, count: item.count })),
            ...(labels.uncategorized ? [{ id: NONE, text: t('noCategory'), count: labels.uncategorized }] : [])].map(option =>
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span className="min-w-0 [overflow-wrap:anywhere]">{option.text}</span>{option.count !== undefined && <Count value={option.count} />}
            </DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>}
    {tags.length > 0 && <DropdownMenu>
      <DropdownMenuTrigger aria-label={value.tags.length ? t('tagsCurrent', { tags: value.tags.join(t('separator')) }) : t('allTags')}
        className={cn(trigger, value.tags.length > 0 && 'border-primary/60')}>
        <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{value.tags.length ? value.tags.join(t('separator')) : t('allTags')}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className={content}>
        <DropdownMenuLabel className="px-3 py-1.5 text-xs text-muted-foreground">{t('tagsHint')}</DropdownMenuLabel>
        {tags.map(tag => {
          const checked = value.tags.some(chosen => key(chosen) === key(tag.name))
          // The menu stays open, so several tags can be chosen in a row.
          return <DropdownMenuCheckboxItem key={tag.name} checked={checked} onSelect={event => event.preventDefault()}
            onCheckedChange={on => onChange({ ...value, tags: on ? [...value.tags, tag.name] : value.tags.filter(chosen => key(chosen) !== key(tag.name)) })}>
            <span className="min-w-0 [overflow-wrap:anywhere]">{tag.name}</span><Count value={tag.count} />
          </DropdownMenuCheckboxItem>
        })}
        {value.tags.length > 0 && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="inset" onSelect={() => onChange({ ...value, tags: [] })}>{t('clearTags')}</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>}
  </>
}
