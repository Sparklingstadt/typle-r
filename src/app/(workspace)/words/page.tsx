"use client"
import { Suspense } from "react"
import { useTranslations } from "next-intl"
import { ErrorAlert } from "@/components/ui/alert"
import { ReloadButton } from "@/components/ui/reload-button"
import PageStorageBadge from "@/components/PageStorageBadge"
import { useWordLists } from "@/lib/useWordLists"
import { PageHeader, PageMain } from "@/components/ui/page-layout"
import NoWords from "@/components/Words/NoWords"
import WordsLoading from "@/components/Words/WordsLoading"
import WordsView from "@/components/Words/WordsView"




export default function Words() {
  const t = useTranslations('wordLists.words')
  const page = useTranslations('wordLists.page')
  const workspace = useWordLists()
  return <PageMain width="wide">
    <PageHeader title={t('title')} description={t('description')}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6" action={<ReloadButton>{page('reload')}</ReloadButton>}>{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <WordsLoading />
      : workspace.lists.length ? <Suspense fallback={<WordsLoading />}><WordsView key={workspace.accountId} lists={workspace.lists} packs={workspace.packs} /></Suspense>
        // After a failed load the lists are unknown; "no lists yet" would be wrong.
        : !workspace.error && <NoWords />}
  </PageMain>
}
