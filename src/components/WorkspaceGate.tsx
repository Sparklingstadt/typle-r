"use client"
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Skeleton } from "@/components/ui/skeleton"
import { Fragment } from 'react'
import Page from './Page/Page'
import PageContainer from './PageContainer/PageContainer'

export default function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const t = useTranslations('common')
  if (status !== 'loading') return <Fragment key={session?.user?.id ?? 'guest:local'}>{children}</Fragment>
  return <Page><PageContainer><div role="status" className="space-y-3"><p>{t('loading')}</p><Skeleton className="h-6 w-2/3" /><Skeleton className="h-11 w-48" /></div></PageContainer></Page>
}
