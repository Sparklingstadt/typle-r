"use client"
import { useTranslations } from 'next-intl'
import { Folder } from 'lucide-react'
import type { SavedWordList } from '@/core/wordLists'
import { cn } from '@/lib/utils'

// A list's category and tags after its name, such as [プログラミング] #Kotlin #JVM. Spans only, so it can sit inside a
// button. Nothing is shown for a list without them.
export default function ListLabels({ list, className }: { list: Pick<SavedWordList, 'category' | 'tags'>; className?: string }) {
  const t = useTranslations('wordLists.labels')
  if (!list.category && !list.tags?.length) return null
  return <span data-list-labels className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
    {list.category && <span className="inline-flex h-5 max-w-full items-center gap-1 rounded-md bg-secondary px-1.5 text-[11px] font-medium text-secondary-foreground">
      <Folder className="size-3 shrink-0" aria-hidden="true" /><span className="sr-only">{t('category')}: </span><span className="truncate">{list.category}</span>
    </span>}
    {list.tags?.map(tag => <span key={tag} className="inline-flex h-5 max-w-full items-center rounded-full border px-1.5 text-[11px] text-muted-foreground">
      <span className="sr-only">{t('tag')}: </span><span aria-hidden="true">#</span><span className="truncate">{tag}</span>
    </span>)}
  </span>
}
