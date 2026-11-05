"use client"
import { useTranslations } from 'next-intl'
import { useWordLists } from '@/lib/useWordLists'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import InterestSettings from '@/components/Settings/InterestSettings'
import InterestPacks from '@/components/Settings/InterestPacks'
import PageStorageBadge from '@/components/PageStorageBadge'
import { PageMain } from '@/components/ui/page-layout'

export default function Interests() {
  const workspace = useWordLists()
  const t = useTranslations('interests')
  const common = useTranslations('common')
  return <PageMain width="narrow">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </header>
    {workspace.error && <Alert variant="destructive" className="mb-6"><AlertDescription>{workspace.error}</AlertDescription></Alert>}
    {!workspace.ready ? <div role="status" className="space-y-3"><p className="sr-only">{common('loading')}</p><Skeleton className="h-10 w-72 max-w-full" /><Skeleton className="h-24 w-full" /></div>
      : <div className="space-y-8">
        <InterestSettings key={workspace.accountId} interests={workspace.interests} saving={workspace.saving} updateInterests={workspace.updateInterests} />
        <InterestPacks key={`packs-${workspace.accountId}`} packs={workspace.packs} lists={workspace.lists} interests={workspace.interests}
          saving={workspace.saving} updateLibrary={workspace.updateLibrary} />
      </div>}
  </PageMain>
}
