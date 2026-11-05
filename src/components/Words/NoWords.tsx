import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ListPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, EmptyStateIcon } from '@/components/ui/empty-state'

export default function NoWords() {
  const t = useTranslations('wordLists')
  return <EmptyState className="py-10 sm:py-14">
    <EmptyStateIcon icon={ListPlus} />
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('empty.title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.description')}</p>
    </div>
    <Button asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('manager.create')}</Link></Button>
  </EmptyState>
}
