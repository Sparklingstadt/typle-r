import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Keyboard, Plus, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, EmptyStateIcon } from '@/components/ui/empty-state'

export default function NoRankings() {
  const t = useTranslations('rankings.empty')
  return <EmptyState className="py-12 sm:py-16">
    <EmptyStateIcon icon={Trophy} className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('description')}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="lg" asChild><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
      <Button size="lg" variant="outline" asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('create')}</Link></Button>
    </div>
  </EmptyState>
}
