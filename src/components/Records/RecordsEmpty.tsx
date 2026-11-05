import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { History, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, EmptyStateIcon } from '@/components/ui/empty-state'
import { usePracticeName } from '@/components/PracticeName'
import type { SavedWordList } from '@/core/wordLists'

export function NoRecords() {
  const t = useTranslations('records.empty')
  return <EmptyState className="py-10 sm:py-14">
    <EmptyStateIcon icon={History} />
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('description')}</p>
    </div>
    <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
  </EmptyState>
}

export function FilteredEmpty({ list, onClear }: { list?: SavedWordList; onClear: () => void }) {
  const t = useTranslations('records')
  const nameOf = usePracticeName()
  const unpractised = list && !list.records.length
  return <EmptyState className="py-10">
    <div className="space-y-1.5">
      <h2 className="font-bold">{unpractised ? t('filteredEmpty.listTitle', { name: nameOf(list) }) : t('filteredEmpty.title')}</h2>
      <p className="text-sm text-muted-foreground">{t(unpractised ? 'filteredEmpty.listDescription' : 'filteredEmpty.description')}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      {list && <Button asChild><Link href={`/play?list=${encodeURIComponent(list.id)}`}><Keyboard aria-hidden="true" />{t('filteredEmpty.practiceList')}</Link></Button>}
      <Button variant="outline" onClick={onClear}>{t('filter.clear')}</Button>
    </div>
  </EmptyState>
}
