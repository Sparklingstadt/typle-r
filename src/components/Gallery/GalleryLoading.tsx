import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'

export default function GalleryLoading() {
  const common = useTranslations('common')
  return <div role="status" className="space-y-3">
    <span className="sr-only">{common('loading')}</span>
    <Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-full" />
    <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(key => <Skeleton key={key} className="h-28 w-full" />)}</div>
  </div>
}
