import { useId, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { listBest } from '@/core/records'
import { groupEntries, levelName, levelSteps, listAtLevels } from '@/core/listOverview'
import type { SavedWordList } from '@/core/wordLists'
import ListLabels from '@/components/WordLists/ListLabels'

const option = 'flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50'

function Radio({ selected }: { selected: boolean }) {
  return <span aria-hidden="true" className={cn('grid size-[18px] shrink-0 place-items-center rounded-full border-2', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
    {selected && <Check className="size-3" strokeWidth={3} />}
  </span>
}

function useSummary() {
  const t = useTranslations('practice.options')
  return (list: SavedWordList) => {
    const best = listBest(list)
    return best ? t('withBest', { count: list.words.length, time: best.time.toFixed(2) }) : t('noRecord', { count: list.words.length })
  }
}

// The lists to choose from. The lists of a group (such as Linuxコマンド in 基本, オプション and 応用, each in 初級 to 上級)
// are one option, which opens to have its levels chosen one step after another.
export default function WordListOptions({ lists, saved, selectedId, onSelect, label }: {
  lists: SavedWordList[]
  /** Every list in its saved order, which a group's levels are offered in, whatever order `lists` is in. */
  saved: SavedWordList[]
  selectedId?: string
  onSelect: (id: string) => void
  label: string
}) {
  const t = useTranslations('practice.options')
  const summary = useSummary()
  const id = useId()
  return <ul aria-label={label} className="grid gap-1">
    {groupEntries(lists, list => list, saved).map((entry, index) => {
      // Picking a list elsewhere starts the group again from that list's levels.
      if (entry.group !== null) return <GroupOption key={`group:${entry.group}:${entry.items.some(list => list.id === selectedId) ? selectedId : ''}`}
        group={entry.group} lists={[...entry.items].sort((a, b) => saved.indexOf(a) - saved.indexOf(b))} selectedId={selectedId} onSelect={onSelect} />
      const [list] = entry.items
      const selected = list.id === selectedId
      return <li key={list.id}>
        <button type="button" aria-pressed={selected} aria-label={t(selected ? 'selected' : 'select', { name: list.name })} aria-describedby={`${id}-${index}`} onClick={() => onSelect(list.id)}
          className={cn(option, selected && 'bg-muted hover:bg-muted')}>
          <Radio selected={selected} />
          <span className="grid min-w-0">
            <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={list.name}>{list.name}</span>
            <ListLabels list={list} className="my-0.5" />
            <span id={`${id}-${index}`} className="text-xs text-muted-foreground">{summary(list)}</span>
          </span>
        </button>
      </li>
    })}
  </ul>
}

function GroupOption({ group, lists, selectedId, onSelect }: { group: string; lists: SavedWordList[]; selectedId?: string; onSelect: (id: string) => void }) {
  const t = useTranslations('practice.options')
  const summary = useSummary()
  const id = useId()
  const current = lists.find(list => list.id === selectedId)
  // The group of the list being practised starts open, at its levels.
  const [open, setOpen] = useState(!!current)
  const [chosen, setChosen] = useState<string[]>(() => current ? current.levels?.length ? current.levels : [current.name] : [])
  const steps = levelSteps(lists, chosen)
  function choose(step: number, level: string) {
    const next = [...chosen.slice(0, step), level]
    const list = listAtLevels(lists, next)
    setChosen(next)
    // A level that leaves one list to practise picks it; otherwise the next step is asked.
    if (list && levelSteps(lists, next).length === next.length) onSelect(list.id)
  }
  return <li data-group={group}>
    <button type="button" aria-expanded={open} aria-controls={`${id}-levels`} aria-describedby={`${id}-summary`} onClick={() => setOpen(value => !value)}
      className={cn(option, current && 'bg-muted hover:bg-muted')}>
      <Radio selected={!!current} />
      <span className="grid min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={group}>{group}</span>
        <ListLabels list={lists[0]} className="my-0.5" />
        <span id={`${id}-summary`} className="text-xs text-muted-foreground">
          {current ? t('groupSelected', { level: levelName(current), summary: summary(current) }) : t('groupLists', { count: lists.length })}
        </span>
      </span>
      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-levels`} role="group" aria-label={t('levels', { name: group })} className="grid gap-2 px-3 pt-1 pb-2.5 pl-[42px]">
      {steps.map((step, index) => <div key={index} role="group" aria-label={t('step', { n: index + 1 })} className="flex flex-wrap gap-1.5">
        {step.options.map(level => {
          const pressed = step.chosen === level
          const list = listAtLevels(lists, [...chosen.slice(0, index), level])
          const final = list && levelSteps(lists, [...chosen.slice(0, index), level]).length === index + 1
          return <button key={level} type="button" aria-pressed={pressed} onClick={() => choose(index, level)}
            title={final ? `${list.name} · ${summary(list)}` : undefined}
            className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
              pressed && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')}>
            {level}
          </button>
        })}
      </div>)}
      {steps.at(-1)?.chosen === null && <p className="text-xs text-muted-foreground">{t('chooseLevel')}</p>}
    </div>}
  </li>
}
