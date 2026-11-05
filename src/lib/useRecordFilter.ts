import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RecordFilter } from '@/core/records'

// `?pack=<id>&list=<id>&device=<id>` keeps the filter in the URL, so the practice result and the dashboard can link to one list's history.
export function useRecordFilter(): [RecordFilter, (next: RecordFilter) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const filter = { pack: params.get('pack'), list: params.get('list'), device: params.get('device') }
  return [filter, next => {
    const query = new URLSearchParams()
    if (next.pack) query.set('pack', next.pack)
    if (next.list) query.set('list', next.list)
    if (next.device) query.set('device', next.device)
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false })
  }]
}
