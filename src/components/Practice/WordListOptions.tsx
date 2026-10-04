import { useId } from 'react'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { listBest } from '@/core/records'
import type { SavedWordList } from '@/core/wordLists'

export default function WordListOptions({ lists, selectedId, onSelect, label }: {
  lists: SavedWordList[]
  selectedId?: string
  onSelect: (id: string) => void
  label: string
}) {
  const t = useTranslations('practice.options')
  const id = useId()
  return <ul aria-label={label} className="grid gap-1">
    {lists.map((list, index) => {
      const best = listBest(list)
      const selected = list.id === selectedId
      return <li key={list.id}>
        <button type="button" aria-pressed={selected} aria-label={t(selected ? 'selected' : 'select', { name: list.name })} aria-describedby={`${id}-${index}`} onClick={() => onSelect(list.id)}
          className={cn('flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50', selected && 'bg-muted hover:bg-muted')}>
          <span aria-hidden="true" className={cn('grid size-[18px] shrink-0 place-items-center rounded-full border-2', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
            {selected && <Check className="size-3" strokeWidth={3} />}
          </span>
          <span className="grid min-w-0">
            <span className="truncate text-sm font-medium">{list.name}</span>
            <span id={`${id}-${index}`} className="text-xs text-muted-foreground">{best ? t('withBest', { count: list.words.length, time: best.time.toFixed(2) }) : t('noRecord', { count: list.words.length })}</span>
          </span>
        </button>
      </li>
    })}
  </ul>
}
