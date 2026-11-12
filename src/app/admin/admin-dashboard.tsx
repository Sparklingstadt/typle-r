"use client"
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogOut, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PageHeader, PageMain } from '@/components/ui/page-layout'
import { ApiError, api } from '@/core/api'
import { useFormat } from '@/i18n/useFormat'
import AdminList from './admin-list'
import GalleryList from './gallery-list'
import type { Overview } from './overview'
import RecentShares from './recent-shares'
import SignInCard from './sign-in-card'
import StatCards from './stat-cards'
import UserList from './user-list'

type Answer = { admin: { email: string; sub: string }; overview: Overview }

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; answer: Answer }

type ErrorKey = Parameters<ReturnType<typeof useTranslations<'errors'>>>[0]

// The errors a login to the dashboard comes back with (/admin?error=…, server/internal/web/admin.go).
const loginErrors = ['adminForbidden', 'adminUnavailable'] as const
type LoginError = typeof loginErrors[number]
const isLoginError = (value: string | null): value is LoginError => loginErrors.some(key => key === value)

export default function AdminDashboard() {
  const t = useTranslations('admin')
  const errors = useTranslations('errors')
  const format = useFormat()
  const loginError = useSearchParams().get('error')
  const refused = isLoginError(loginError) ? loginError : null
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [signOutFailed, setSignOutFailed] = useState(false)

  const errorText = useCallback((key: unknown) => {
    const known = typeof key === 'string' && errors.has(key as ErrorKey)
    return known ? errors(key as ErrorKey) : t('loadFailed')
  }, [errors, t])

  const fetchDashboard = useCallback(async (): Promise<State> => {
    try {
      return { kind: 'ready', answer: await api<Answer>('/api/admin/dashboard') }
    } catch (reason) {
      if (!(reason instanceof ApiError)) return { kind: 'failed', error: t('loadFailed') }
      if (reason.status === 401) return { kind: 'signedOut' }
      if (reason.status === 403) return { kind: 'signedOut', error: errorText(reason.key) }
      return { kind: 'failed', error: errorText(reason.key) }
    }
  }, [errorText, t])

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    setState(await fetchDashboard())
  }, [fetchDashboard])

  useEffect(() => {
    let current = true
    void fetchDashboard().then(next => { if (current) setState(next) })
    return () => { current = false }
  }, [fetchDashboard])

  async function signOut() {
    setSignOutFailed(false)
    try {
      const response = await fetch('/api/auth/admin/signout', { method: 'POST' })
      if (!response.ok) throw new Error('admin sign-out failed')
      setState({ kind: 'signedOut' })
    } catch { setSignOutFailed(true) }
  }

  const time = (value: string | null) => value
    ? t('dateTime', { date: format.numericDate(new Date(value)), time: format.clock(new Date(value)) }) : t('never')

  return <PageMain width="wide">
    <PageHeader title={t('title')} description={t('description')}>
      {state.kind === 'ready' && <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t('signedInAs', { email: state.answer.admin.email })}</span>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw aria-hidden="true" />{t('refresh')}</Button>
        <Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut aria-hidden="true" />{t('signOut')}</Button>
      </div>}
    </PageHeader>
    <div className="space-y-6">
      {signOutFailed && <ErrorAlert>{t('signOutFailed')}</ErrorAlert>}

      {state.kind === 'loading' && <p role="status">{t('checking')}</p>}

      {state.kind === 'failed' && <ErrorAlert action={<Button variant="outline" size="sm" onClick={() => void load()}>{t('retry')}</Button>}>{state.error}</ErrorAlert>}

      {state.kind === 'signedOut' && <SignInCard error={state.error} refused={refused && errors(refused)} />}

      {state.kind === 'ready' && <>
        <StatCards overview={state.answer.overview} />

        <UserList time={time} errorText={errorText} />

        <RecentShares shares={state.answer.overview.recentShares} time={time} />

        <GalleryList time={time} errorText={errorText} />

        <AdminList admins={state.answer.overview.admins} time={time} />
      </>}
    </div>
  </PageMain>
}
