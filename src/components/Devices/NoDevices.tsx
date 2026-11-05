import { useTranslations } from 'next-intl'
import { Monitor, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, EmptyStateIcon } from '@/components/ui/empty-state'

export default function NoDevices({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('devices')
  return <EmptyState className="py-10 sm:py-12">
    <EmptyStateIcon icon={Monitor} />
    <div className="space-y-1.5">
      <h3 className="font-bold">{t('empty.title')}</h3>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.description')}</p>
    </div>
    <Button onClick={onAdd}><Plus aria-hidden="true" />{t('add')}</Button>
    <p className="text-xs text-muted-foreground">{t('empty.example')}</p>
  </EmptyState>
}
