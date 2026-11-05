import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'

export default function WordsLoading() {
  const common = useTranslations('common')
  return <div role="status" className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <span className="sr-only">{common('loading')}</span>
    <div className="hidden space-y-3 rounded-xl border bg-card p-3 lg:block">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-1.5 px-1 py-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3.5 w-1/2" /></div>)}
    </div>
    <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
    </div>
  </div>
}
