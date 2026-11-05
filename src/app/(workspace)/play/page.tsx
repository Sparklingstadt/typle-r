"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWordLists } from "@/lib/useWordLists"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import PracticeScreen from "@/components/Practice/PracticeScreen"

function Loading() {
  const common = useTranslations('common')
  return <Page><PageContainer><p>{common('loading')}</p></PageContainer></Page>
}

// `?list=<id>` preselects a list, e.g. from the home dashboard. Reading it needs a Suspense boundary for prerendering.
export default function Play() {
  return <Suspense fallback={<Loading />}><PlayWorkspace /></Suspense>
}

function PlayWorkspace() {
  const listId = useSearchParams().get('list')
  const { lists, packs, devices, accountId, ready, error, addRecord } = useWordLists()
  if (!ready) return <Loading />
  return <PracticeScreen key={accountId} accountId={accountId ?? ""} devices={devices} wordLists={lists} packs={packs} listId={listId} error={error} addRecord={addRecord} />
}
