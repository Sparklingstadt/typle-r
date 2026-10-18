"use client"
import { HardDrive } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** Beside a page heading: the page's data is saved in this browser, with the same icon as the top bar. */
export default function PageStorageBadge() {
  const t = useTranslations('common.storage')
  return <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
    title={t('guestDetail')}>
    <HardDrive className="size-3.5" aria-hidden="true" />{t('guest')}
  </span>
}
