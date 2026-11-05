"use client"
import { useTranslations } from 'next-intl'
import { useWordLists } from '@/lib/useWordLists'
import { ErrorAlert } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import InterestSettings from '@/components/Settings/InterestSettings'
import InterestPacks from '@/components/Settings/InterestPacks'
import PageStorageBadge from '@/components/PageStorageBadge'
import { PageHeader, PageMain } from '@/components/ui/page-layout'

export default function Interests() {
  const workspace = useWordLists()
  const t = useTranslations('interests')
  const common = useTranslations('common')
  return <PageMain width="narrow">
    <PageHeader title={t('title')} description={t('description')}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6">{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <div role="status" className="space-y-3"><p className="sr-only">{common('loading')}</p><Skeleton className="h-10 w-72 max-w-full" /><Skeleton className="h-24 w-full" /></div>
      : <div className="space-y-8">
        <InterestSettings key={workspace.accountId} interests={workspace.interests} saving={workspace.saving} updateInterests={workspace.updateInterests} />
        <InterestPacks key={`packs-${workspace.accountId}`} packs={workspace.packs} lists={workspace.lists} interests={workspace.interests}
          saving={workspace.saving} updateLibrary={workspace.updateLibrary} />
      </div>}
  </PageMain>
}
