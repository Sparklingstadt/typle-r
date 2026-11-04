"use client"
import { useTranslations } from "next-intl"
import { Skeleton } from "@/components/ui/skeleton"

export default function ListsLoading() {
  const common = useTranslations('common')
  return <div role="status">
    <span className="sr-only">{common('loading')}</span>
    <div className="mb-6 space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-96 max-w-full" /></div>
    <Skeleton className="mb-3 h-11 w-full" />
    <div className="divide-y rounded-xl border bg-card">
      {[0, 1, 2, 3].map(key => <div key={key} className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3.5 w-72 max-w-full" /></div>
        <Skeleton className="hidden h-8 w-36 sm:block" /><Skeleton className="size-10" />
      </div>)}
    </div>
  </div>
}
