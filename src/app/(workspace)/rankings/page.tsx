"use client"
import { Suspense } from "react"
import { useTranslations } from "next-intl"
import { ErrorAlert } from "@/components/ui/alert"
import { ReloadButton } from "@/components/ui/reload-button"
import { useWordLists } from "@/lib/useWordLists"
import PageStorageBadge from "@/components/PageStorageBadge"
import { PageHeader, PageMain } from "@/components/ui/page-layout"
import NoRankings from "@/components/Rankings/NoRankings"
import RankingsLoading from "@/components/Rankings/RankingsLoading"
import RankingsView from "@/components/Rankings/RankingsView"





export default function Rankings() {
  const t = useTranslations('rankings')
  const workspace = useWordLists()
  const practised = workspace.lists.some(list => list.records.length)
  return <PageMain width="wide">
    <PageHeader title={t('title')} description={t('intro')}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6" action={<ReloadButton>{t('reload')}</ReloadButton>}>{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <RankingsLoading />
      : practised ? <Suspense fallback={<RankingsLoading />}><RankingsView key={workspace.accountId} lists={workspace.lists} packs={workspace.packs} devices={workspace.devices} /></Suspense>
        // After a failed load there is nothing to show, and "no records yet" would be wrong.
        : !workspace.error && <NoRankings />}
  </PageMain>
}
