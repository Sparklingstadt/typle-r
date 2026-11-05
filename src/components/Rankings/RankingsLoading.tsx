import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'

export default function RankingsLoading() {
  const common = useTranslations('common')
  return <div role="status" className="space-y-4">
    <span className="sr-only">{common('loading')}</span>
    <div className="flex gap-2"><Skeleton className="h-9 w-36 rounded-full" /><Skeleton className="h-9 w-52 rounded-full" /></div>
    <div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-6">
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-1.5 px-1 py-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3.5 w-1/2" /></div>)}
      </div>
      <div className="hidden space-y-5 rounded-xl border bg-card p-6 xl:block">
        <Skeleton className="h-7 w-1/3" />
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    </div>
  </div>
}
