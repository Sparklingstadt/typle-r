"use client"
import { Cloud, HardDrive } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** Beside a page heading: where the page's data is saved, with the same icons as the top bar. */
export default function PageStorageBadge({ guest }: { guest: boolean }) {
  const t = useTranslations('common.storage')
  const Icon = guest ? HardDrive : Cloud
  return <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
    title={t(guest ? 'guestDetail' : 'accountDetail')}>
    <Icon className="size-3.5" aria-hidden="true" />{t(guest ? 'guest' : 'account')}
  </span>
}
