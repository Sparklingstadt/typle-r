"use client"
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useWordLists } from '@/lib/useWordLists'
import { ErrorAlert } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import PageStorageBadge from '@/components/PageStorageBadge'
import { PageHeader, PageMain } from '@/components/ui/page-layout'
import DeviceManager from '@/components/Devices/DeviceManager'

export default function Devices() {
  const workspace = useWordLists()
  const t = useTranslations('devices')
  const common = useTranslations('common')
  return <PageMain width="narrow">
    <PageHeader title={t('title')} description={t.rich('description', { link: chunks => <Link href="/play" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link> })}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6">{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <div role="status" className="space-y-3"><p>{common('loading')}</p><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
      : <DeviceManager key={workspace.accountId} {...workspace} accountId={workspace.accountId ?? ''} />}
  </PageMain>
}
