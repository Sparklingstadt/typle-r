"use client"
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogIn, LogOut, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, ErrorAlert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageContainer from '@/components/PageContainer/PageContainer'
import { GraphQLError, graphql } from '@/core/graphql'
import { useFormat } from '@/i18n/useFormat'
import GalleryList from './gallery-list'
import UserList from './user-list'

// The adminDashboard of /api/graphql (server/internal/web/graph/schema.graphqls, server/internal/store/admin.go).
type Overview = {
  workspaces: number
  activeDay: number
  activeWeek: number
  activeMonth: number
  sharedPacks: number
  recentShares: { id: string; ownerId: string; name: string; updatedAt: string }[]
  admins: { email: string; ffpfSub: string | null; createdAt: string; lastSeenAt: string | null }[]
}
type Answer = { admin: { email: string; sub: string }; overview: Overview }

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut'; error?: string }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; answer: Answer }

type ErrorKey = Parameters<ReturnType<typeof useTranslations<'errors'>>>[0]

const stats = ['workspaces', 'activeDay', 'activeWeek', 'activeMonth', 'sharedPacks'] as const

const DASHBOARD = `query AdminDashboard { adminDashboard {
  admin { email sub }
  overview { ${stats.join(' ')} recentShares { id ownerId name updatedAt } admins { email ffpfSub createdAt lastSeenAt } }
} }`

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
      const { adminDashboard } = await graphql<{ adminDashboard: Answer }>(DASHBOARD)
      return { kind: 'ready', answer: adminDashboard }
    } catch (reason) {
      if (!(reason instanceof GraphQLError)) return { kind: 'failed', error: t('loadFailed') }
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

  return <PageContainer className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      {state.kind === 'ready' && <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t('signedInAs', { email: state.answer.admin.email })}</span>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw aria-hidden="true" />{t('refresh')}</Button>
        <Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut aria-hidden="true" />{t('signOut')}</Button>
      </div>}
    </header>
    {signOutFailed && <ErrorAlert>{t('signOutFailed')}</ErrorAlert>}

    {state.kind === 'loading' && <p role="status">{t('checking')}</p>}

    {state.kind === 'failed' && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
      {state.error}<Button variant="outline" size="sm" onClick={() => void load()}>{t('retry')}</Button>
    </AlertDescription></Alert>}

    {state.kind === 'signedOut' && <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{t('signIn.title')}</CardTitle>
        <CardDescription>{t('signIn.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(state.error || refused) && <ErrorAlert>{state.error ?? (refused && errors(refused))}</ErrorAlert>}
        <Button asChild><a href="/api/auth/signin?admin=1"><LogIn aria-hidden="true" />{t('signIn.button')}</a></Button>
      </CardContent>
    </Card>}

    {state.kind === 'ready' && <>
      <section aria-label={t('stats.label')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(key => <Card key={key} className="gap-2 py-4">
          <CardHeader className="px-4"><CardDescription>{t(`stats.${key}`)}</CardDescription></CardHeader>
          <CardContent className="px-4 text-3xl font-bold tabular-nums">{state.answer.overview[key].toLocaleString()}</CardContent>
        </Card>)}
      </section>

      <UserList time={time} errorText={errorText} />

      <Card>
        <CardHeader><CardTitle><h2>{t('shares.title')}</h2></CardTitle></CardHeader>
        <CardContent>
          {state.answer.overview.recentShares.length === 0 ? <p>{t('shares.empty')}</p> : <Table>
            <TableHeader><TableRow>
              <TableHead>{t('shares.name')}</TableHead>
              <TableHead>{t('shares.owner')}</TableHead>
              <TableHead>{t('updatedAt')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{state.answer.overview.recentShares.map(row => <TableRow key={row.id}>
              <TableCell><a className="underline" href={`/shared/${row.id}`}>{row.name || t('shares.unnamed')}</a></TableCell>
              <TableCell className="font-mono">{row.ownerId}</TableCell>
              <TableCell>{time(row.updatedAt)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>}
        </CardContent>
      </Card>

      <GalleryList time={time} errorText={errorText} />

      <Card>
        <CardHeader><CardTitle><h2>{t('admins.title')}</h2></CardTitle></CardHeader>
        <CardContent><Table>
          <TableHeader><TableRow>
            <TableHead>{t('admins.email')}</TableHead>
            <TableHead>{t('admins.ffpfSub')}</TableHead>
            <TableHead>{t('admins.createdAt')}</TableHead>
            <TableHead>{t('admins.lastSeenAt')}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{state.answer.overview.admins.map(row => <TableRow key={row.email}>
            <TableCell className="font-mono">{row.email}</TableCell>
            <TableCell className="font-mono">{row.ffpfSub ?? t('admins.unbound')}</TableCell>
            <TableCell>{time(row.createdAt)}</TableCell>
            <TableCell>{time(row.lastSeenAt)}</TableCell>
          </TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </>}
  </PageContainer>
}
