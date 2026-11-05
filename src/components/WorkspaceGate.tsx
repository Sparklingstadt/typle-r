"use client"
import { Skeleton } from "@/components/ui/skeleton"
import { Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { useWordLists } from '@/lib/useWordLists'
import { PageMain } from '@/components/ui/page-layout'

// Remounts the page for another account, so no screen keeps drafts or selections from the previous one.
export default function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { accountId } = useWordLists()
  const t = useTranslations('common')
  if (accountId) return <Fragment key={accountId}>{children}</Fragment>
  return <PageMain width="medium"><div role="status" className="space-y-3"><p>{t('loading')}</p><Skeleton className="h-6 w-2/3" /><Skeleton className="h-11 w-48" /></div></PageMain>
}
