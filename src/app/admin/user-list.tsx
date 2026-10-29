"use client"
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from 'radix-ui'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GraphQLError, graphql } from '@/core/graphql'

// The adminUsers of /api/graphql (server/internal/web/graph/schema.graphqls, server/internal/store/admin.go).
type User = { ownerId: string; lists: number; packs: number; devices: number; shares: number; revision: number; updatedAt: string }
type Page = { page: number; pageSize: number; total: number; users: User[] }

type State = { kind: 'loading' } | { kind: 'failed'; error: string } | { kind: 'ready'; answer: Page }

const USERS = `query AdminUsers($page: Int!) { adminUsers(page: $page) {
  page pageSize total users { ownerId lists packs devices shares revision updatedAt }
} }`

// A GitHub account is github:<numeric user id>, and GitHub serves its avatar by that id. The local account (github:0) and
// FFPF ID accounts (ffpf:<sub>) have none.
function avatarOf(ownerId: string) {
  const id = /^github:(\d+)$/.exec(ownerId)?.[1]
  return id && id !== '0' ? `https://avatars.githubusercontent.com/u/${id}?s=64` : undefined
}

export default function UserList({ time, errorText }: { time: (value: string) => string; errorText: (key: unknown) => string }) {
  const t = useTranslations('admin.users')
  const [page, setPage] = useState(0)
  const [state, setState] = useState<State>({ kind: 'loading' })

  const fetchPage = useCallback(async (number: number): Promise<State> => {
    try {
      const { adminUsers } = await graphql<{ adminUsers: Page }>(USERS, { page: number })
      return { kind: 'ready', answer: adminUsers }
    } catch (reason) {
      return { kind: 'failed', error: errorText(reason instanceof GraphQLError ? reason.key : null) }
    }
  }, [errorText])

  useEffect(() => {
    let current = true
    void fetchPage(page).then(next => { if (current) setState(next) })
    return () => { current = false }
  }, [fetchPage, page])

  const go = (number: number) => {
    setState({ kind: 'loading' })
    setPage(number)
  }

  const answer = state.kind === 'ready' ? state.answer : null
  const pages = answer ? Math.max(1, Math.ceil(answer.total / answer.pageSize)) : 1
  const from = answer && answer.users.length ? answer.page * answer.pageSize + 1 : 0
  const to = answer ? answer.page * answer.pageSize + answer.users.length : 0

  return <Card>
    <CardHeader>
      <CardTitle><h2>{t('title')}</h2></CardTitle>
      <CardDescription>{t('description')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {state.kind === 'loading' && <p role="status">{t('loading')}</p>}
      {state.kind === 'failed' && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
        {state.error}<Button variant="outline" size="sm" onClick={() => go(page)}>{t('retry')}</Button>
      </AlertDescription></Alert>}
      {answer && (answer.total === 0 ? <p>{t('empty')}</p> : <>
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t('account')}</TableHead>
            <TableHead className="text-right">{t('lists')}</TableHead>
            <TableHead className="text-right">{t('packs')}</TableHead>
            <TableHead className="text-right">{t('devices')}</TableHead>
            <TableHead className="text-right">{t('shares')}</TableHead>
            <TableHead className="text-right">{t('revision')}</TableHead>
            <TableHead>{t('updatedAt')}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{answer.users.map(user => <TableRow key={user.ownerId}>
            <TableCell>
              <span className="flex items-center gap-2">
                <Avatar.Root className="relative flex size-6 shrink-0 overflow-hidden rounded-full bg-muted">
                  <Avatar.Image src={avatarOf(user.ownerId)} alt="" className="size-full object-cover" />
                  <Avatar.Fallback aria-hidden="true" className="size-full bg-secondary" />
                </Avatar.Root>
                <span className="font-mono">{user.ownerId}</span>
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{user.lists}</TableCell>
            <TableCell className="text-right tabular-nums">{user.packs}</TableCell>
            <TableCell className="text-right tabular-nums">{user.devices}</TableCell>
            <TableCell className="text-right tabular-nums">{user.shares}</TableCell>
            <TableCell className="text-right tabular-nums">{user.revision}</TableCell>
            <TableCell>{time(user.updatedAt)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('range', { from, to, total: answer.total })}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={answer.page === 0} onClick={() => go(answer.page - 1)}>
              <ChevronLeft aria-hidden="true" />{t('previous')}
            </Button>
            <span className="text-sm tabular-nums">{t('page', { page: answer.page + 1, pages })}</span>
            <Button variant="outline" size="sm" disabled={answer.page + 1 >= pages} onClick={() => go(answer.page + 1)}>
              {t('next')}<ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      </>)}
    </CardContent>
  </Card>
}
