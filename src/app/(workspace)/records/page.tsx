"use client"
import { Suspense } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ErrorAlert } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useWordLists } from "@/lib/useWordLists"
import PageStorageBadge from "@/components/PageStorageBadge"
import { PageHeader, PageMain } from "@/components/ui/page-layout"
import RecordHistory from "@/components/Records/RecordHistory"

export default function Records() {
  return <Suspense fallback={<Loading />}><RecordsPage /></Suspense>
}

function Loading() {
  const common = useTranslations('common')
  return <div role="status" className="space-y-3"><span className="sr-only">{common('loading')}</span><Skeleton className="h-9 w-72" /><Skeleton className="h-64 w-full" /></div>
}

function RecordsPage() {
  const t = useTranslations('records')
  const workspace = useWordLists()
  const link = "underline underline-offset-3 hover:text-foreground"
  return <PageMain width="medium">
    <PageHeader title={t('title')} description={t.rich('intro', {
        rankings: chunks => <Link href="/rankings" className={link}>{chunks}</Link>,
        home: chunks => <Link href="/home" className={link}>{chunks}</Link>,
      })}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6">{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <Loading /> : <RecordHistory key={workspace.accountId} failed={Boolean(workspace.error)} lists={workspace.lists} packs={workspace.packs} saving={workspace.saving} deleteRecord={workspace.deleteRecord} />}
  </PageMain>
}
