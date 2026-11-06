"use client"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWordLists } from "@/lib/useWordLists"
import PracticeScreen from "@/components/Practice/PracticeScreen"

// The same frame as PracticeScreen's <main>, so the page does not shift when the practice appears.
function Loading() {
  const common = useTranslations('common')
  return <main className="mx-auto my-6 w-11/12 max-w-7xl pb-12 sm:my-8"><p>{common('loading')}</p></main>
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
