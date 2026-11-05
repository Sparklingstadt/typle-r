import type { ReactNode } from 'react'
import { PageMain } from '@/components/ui/page-layout'

/** Layout for the word list editor; on mobile its sticky action bar spans this padding. */
export default function WordListEditorPage({ children }: { children: ReactNode }) {
  return <PageMain width="medium" className="pb-0">{children}</PageMain>
}
