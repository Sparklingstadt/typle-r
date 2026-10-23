"use client"
import { Cloud, HardDrive } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { WorkspaceLocation } from '@/core/workspaceStore'

/** Beside a page heading on narrow screens, where the top bar hides its own badge: where the page's data is saved, with the same icons. Nothing until that is known. */
export default function PageStorageBadge({ storage }: { storage?: WorkspaceLocation }) {
  const t = useTranslations('common.storage')
  if (!storage) return null
  const guest = storage === 'browser'
  const Icon = guest ? HardDrive : Cloud
  return <span className="inline-flex h-7 items-center sm:hidden gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
    title={t(guest ? 'guestDetail' : 'accountDetail')}>
    <Icon className="size-3.5" aria-hidden="true" />{t(guest ? 'guest' : 'account')}
  </span>
}
