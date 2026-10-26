import { useId, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { listBest } from '@/core/records'
import { levelName, levelSteps, listAtLevels } from '@/core/listOverview'
import { packChoices } from '@/core/packPractice'
import { matchingListIds, type PackOverview } from '@/core/packEditing'
import type { SavedWordList } from '@/core/wordLists'
import ListLabels from '@/components/WordLists/ListLabels'
import PracticeName, { usePracticeName } from '@/components/PracticeName'

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

// The packs to choose a list from, in the order given. A pack of one list is that list's option; a pack of several is one
// option, which opens to have its lists chosen one level after another (the lists with levels first, then those without).
// `query` is the search the packs were found by: a pack found by one of its lists opens to show which. `resetKey` changes
// when a chosen list was not switched to after all (the switch was cancelled), so the levels chosen for it are let go.
export default function WordListOptions({ packs, selectedId, onSelect, label, query = '', resetKey = 0 }: {
  packs: PackOverview[]
  selectedId?: string
  onSelect: (id: string) => void
  label: string
  query?: string
  resetKey?: number
}) {
  const t = useTranslations('practice.options')
  const summary = useSummary()
  const practiceName = usePracticeName()
  const id = useId()
  return <ul aria-label={label} className="grid gap-1">
    {packs.map((item, index) => {
      const lists = packChoices(item)
      // Picking a list elsewhere starts the pack again from that list's levels.
      if (lists.length >= 2) return <PackOption key={`${item.pack.id}:${lists.some(list => list.id === selectedId) ? selectedId : ''}`}
        packId={item.pack.id} name={item.pack.name} lists={lists} selectedId={selectedId} onSelect={onSelect}
        matches={matchingListIds(item, query)} resetKey={resetKey} />
      const [list] = lists
      if (!list) return null
      const selected = list.id === selectedId
      return <li key={item.pack.id} data-pack-id={item.pack.id}>
        <button type="button" aria-pressed={selected} aria-label={t(selected ? 'selected' : 'select', { name: practiceName(list) })} aria-describedby={`${id}-${index}`} onClick={() => onSelect(list.id)}
          className={cn(option, selected && 'bg-muted hover:bg-muted')}>
          <Radio selected={selected} />
          <span className="grid min-w-0">
            <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={practiceName(list)}><PracticeName list={list} /></span>
            <ListLabels list={list} className="my-0.5" />
            <span id={`${id}-${index}`} className="text-xs text-muted-foreground">{summary(list)}</span>
          </span>
        </button>
      </li>
    })}
  </ul>
}

const levelPath = (list: SavedWordList) => list.levels?.length ? list.levels : [list.name]

function PackOption({ packId, name, lists, selectedId, onSelect, matches, resetKey }: {
  packId: string
  name: string
  lists: SavedWordList[]
  selectedId?: string
  onSelect: (id: string) => void
  /** The lists the search found by their name or a word. */
  matches: string[]
  resetKey: number
}) {
  const t = useTranslations('practice.options')
  const summary = useSummary()
  const id = useId()
  const current = lists.find(list => list.id === selectedId)
  const startLevels = () => current ? levelPath(current) : []
  // The pack of the list being practised starts open, at its levels, and so does a pack the search found by its lists.
  const [open, setOpen] = useState(!!current || matches.length > 0)
  const [chosen, setChosen] = useState<string[]>(startLevels)
  const matchKey = matches.join('\n')
  const [seen, setSeen] = useState({ matchKey, resetKey })
  if (seen.matchKey !== matchKey || seen.resetKey !== resetKey) {
    setSeen({ matchKey, resetKey })
    if (seen.matchKey !== matchKey && matches.length) setOpen(true)
    if (seen.resetKey !== resetKey) setChosen(startLevels())
  }
  const steps = levelSteps(lists, chosen)
  // Packs whose lists have no levels are chosen from by list.
  const anyLevels = lists.some(list => list.levels?.length)
  const found = (prefix: string[]) => lists.some(list => matches.includes(list.id) && prefix.every((level, n) => levelPath(list)[n] === level))
  function choose(step: number, level: string) {
    const next = [...chosen.slice(0, step), level]
    const list = listAtLevels(lists, next)
    setChosen(next)
    // A level that leaves one list to practise picks it; otherwise the next step is asked.
    if (list && levelSteps(lists, next).length === next.length) onSelect(list.id)
  }
  return <li data-pack-id={packId}>
    <button type="button" aria-expanded={open} aria-controls={`${id}-levels`} aria-describedby={`${id}-summary`} onClick={() => setOpen(value => !value)}
      className={cn(option, current && 'bg-muted hover:bg-muted')}>
      <Radio selected={!!current} />
      <span className="grid min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={name}>{name}</span>
        <ListLabels list={lists[0]} className="my-0.5" />
        <span id={`${id}-summary`} className="text-xs text-muted-foreground">
          {current ? t('groupSelected', { level: levelName(current), summary: summary(current) }) : t(anyLevels ? 'groupLists' : 'groupListsPlain', { count: lists.length })}
        </span>
      </span>
      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
    </button>
    {open && <div id={`${id}-levels`} role="group" aria-label={t(anyLevels ? 'levels' : 'listsOf', { name })} className="grid gap-2 px-3 pt-1 pb-2.5 pl-[42px]">
      {/* A list has one level at most (v0.97.0), so there is one step, named by the group around it. */}
      {steps.map((step, index) => <div key={index} className="flex flex-wrap gap-1.5">
        {step.options.map(level => {
          const pressed = step.chosen === level
          const prefix = [...chosen.slice(0, index), level]
          const list = listAtLevels(lists, prefix)
          const final = list && levelSteps(lists, prefix).length === index + 1
          // A choice that leads to a list the search found is marked, in its look and for screen readers.
          const match = found(prefix)
          return <button key={level} type="button" aria-pressed={pressed} onClick={() => choose(index, level)}
            title={final ? `${list.name} · ${summary(list)}` : undefined} data-match={match || undefined} aria-describedby={match ? `${id}-match` : undefined}
            className={cn('inline-flex h-8 items-center rounded-full border px-3 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
              match && !pressed && 'border-primary bg-primary/10 font-medium text-primary',
              pressed && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90')}>
            {level}
          </button>
        })}
      </div>)}
      {steps.at(-1)?.chosen === null && <p className="text-xs text-muted-foreground">{t(anyLevels ? 'chooseLevel' : 'chooseList')}</p>}
      {matches.length > 0 && <span id={`${id}-match`} hidden>{t('match')}</span>}
    </div>}
  </li>
}
