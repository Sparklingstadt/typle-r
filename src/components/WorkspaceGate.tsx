"use client"
import { Skeleton } from "@/components/ui/skeleton"
import { Fragment } from 'react'
import { useWordLists } from '@/lib/useWordLists'
import Page from './Page/Page'
import PageContainer from './PageContainer/PageContainer'

// Remounts the page for another account or profile, so no screen keeps drafts or selections from the previous one.
export default function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { accountId, profileId } = useWordLists()
  if (accountId) return <Fragment key={`${accountId}\n${profileId}`}>{children}</Fragment>
  return <Page><PageContainer><div role="status" className="space-y-3"><p>読み込み中…</p><Skeleton className="h-6 w-2/3" /><Skeleton className="h-11 w-48" /></div></PageContainer></Page>
}
