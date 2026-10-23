"use client"
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, History, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ListOverview } from '@/core/listOverview'
import { cn } from '@/lib/utils'
import ListLabels from './ListLabels'
import { usePracticeText } from './ListRow'

// The lists of a group as one row, such as Linuxコマンド with its 11 lists, which opens to show each of them with its
// own actions. 練習 opens the list of the group practised last, or its first.
export default function GroupRow({ group, items, now, open, onToggle, children }: {
  group: string
  items: ListOverview[]
  now: Date
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const t = useTranslations('wordLists.group')
  const practiceText = usePracticeText()
  const words = items.reduce((sum, item) => sum + item.list.words.length, 0)
  const practiced = items.filter(item => item.lastPracticed !== null)
  const latest = practiced.reduce<ListOverview | null>((last, item) => last && (last.lastPracticed ?? 0) >= (item.lastPracticed ?? 0) ? last : item, null)
  const usage = practiceText({ list: items[0].list, position: 0, practiceCount: items.reduce((sum, item) => sum + item.practiceCount, 0),
    lastPracticed: latest?.lastPracticed ?? null }, now)
  const id = `group-${encodeURIComponent(group)}`
  return <li data-group={group}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:gap-x-5 sm:px-5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {/* The heading holds the button that opens the group, as the disclosure pattern has it. */}
          <h3 className="font-medium [overflow-wrap:anywhere]">
            <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
              className="-my-1 -ml-1.5 inline-flex items-start gap-1.5 rounded-md py-1 pr-1 pl-1.5 text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              <ChevronRight className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
              {group}
            </button>
          </h3>
          <ListLabels list={items[0].list} />
        </div>
        <p className="text-sm text-muted-foreground">{t('levels', { levels: items.length })}</p>
        <p className="pt-0.5 text-xs text-muted-foreground tabular-nums sm:hidden">{t('wordCount', { count: words })} · {usage}</p>
      </div>
      <div className="hidden space-y-0.5 text-[13px] tabular-nums sm:block">
        <p className="font-medium">{t('wordCount', { count: words })}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="size-3.5 shrink-0" aria-hidden="true" />{usage}</p>
      </div>
      <Button asChild variant="ghost" size="lg" className="h-10 px-3 text-muted-foreground" title={t('practice')}>
        <Link href={`/play?list=${encodeURIComponent((latest ?? items[0]).list.id)}`} aria-label={t('practiceGroup', { name: group })}>
          <Keyboard aria-hidden="true" /><span className="hidden sm:inline">{t('practice')}</span>
        </Link>
      </Button>
    </div>
    {open && <ul id={id} aria-label={t('lists', { name: group })} className="ml-4 divide-y border-t border-l sm:ml-6">{children}</ul>}
  </li>
}
