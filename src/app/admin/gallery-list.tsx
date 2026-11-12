"use client"
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import { ErrorAlert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError, api } from '@/core/api'

// The packs of /api/admin/gallery (server/internal/web/admin.go, server/internal/store/gallery.go), the most reported first.
type Pack = {
  id: string
  name: string
  category?: string
  added: number
  listedAt: string | null
  hiddenAt: string | null
  reports: number
  reasons: Record<string, number>
}

type State = { kind: 'loading' } | { kind: 'failed'; error: string } | { kind: 'ready'; packs: Pack[] }

// The reasons a report can give, in the order the report dialog lists them (the same labels).
const reasonKeys = ['inappropriate', 'spam', 'personalInfo', 'other'] as const

export default function GalleryList({ time, errorText }: { time: (value: string | null) => string; errorText: (key: unknown) => string }) {
  const t = useTranslations('admin.gallery')
  const format = useFormat()
  const shares = useTranslations('admin.shares')
  const reasons = useTranslations('wordLists.report.reasons')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [actionFailed, setActionFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchPacks = useCallback(async (): Promise<State> => {
    try {
      const { packs } = await api<{ packs: Pack[] }>('/api/admin/gallery')
      return { kind: 'ready', packs: packs.map(pack => ({ ...pack, reasons: pack.reasons ?? {} })) }
    } catch (reason) {
      return { kind: 'failed', error: errorText(reason instanceof ApiError ? reason.key : null) }
    }
  }, [errorText])

  useEffect(() => {
    let current = true
    void fetchPacks().then(next => { if (current) setState(next) })
    return () => { current = false }
  }, [fetchPacks])

  async function change(pack: Pack, action: 'hide' | 'unhide') {
    setBusy(true)
    setActionFailed(null)
    try {
      try {
        await api(`/api/admin/gallery/${action}`, { method: 'POST', body: { id: pack.id } })
      } catch (reason) {
        if (!(reason instanceof ApiError)) throw reason
        // The owner may have stopped sharing meanwhile (404): show the server's reason and re-read the list.
        setActionFailed(errorText(reason.key))
      }
      setState(await fetchPacks())
    } catch { setActionFailed(t('failed')) }
    finally { setBusy(false) }
  }

  return <Card role="region" aria-labelledby="admin-gallery-title">
    <CardHeader>
      <CardTitle><h2 id="admin-gallery-title">{t('title')}</h2></CardTitle>
      <CardDescription>{t('description')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {actionFailed && <ErrorAlert>{actionFailed}</ErrorAlert>}
      {state.kind === 'loading' && <p role="status">{t('loading')}</p>}
      {state.kind === 'failed' && <ErrorAlert action={<Button variant="outline" size="sm" onClick={() => { setState({ kind: 'loading' }); void fetchPacks().then(setState) }}>{t('retry')}</Button>}>{state.error}</ErrorAlert>}
      {state.kind === 'ready' && (state.packs.length === 0 ? <p>{t('empty')}</p> : <Table>
        <TableHeader><TableRow>
          <TableHead>{t('name')}</TableHead>
          <TableHead>{t('category')}</TableHead>
          <TableHead className="text-right">{t('added')}</TableHead>
          <TableHead>{t('listedAt')}</TableHead>
          <TableHead>{t('reports')}</TableHead>
          <TableHead>{t('state')}</TableHead>
          <TableHead><span className="sr-only">{t('actions')}</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{state.packs.map(pack => <TableRow key={pack.id}>
          <TableCell><a id={`admin-gallery-pack-${pack.id}`} className="underline" href={`/shared/${pack.id}`}>{pack.name || shares('unnamed')}</a></TableCell>
          <TableCell>{pack.category ?? ''}</TableCell>
          <TableCell className="text-right tabular-nums">{format.number(pack.added)}</TableCell>
          <TableCell>{time(pack.listedAt)}</TableCell>
          <TableCell>
            <span className="tabular-nums">{t('reportCount', { count: pack.reports })}</span>
            {reasonKeys.filter(key => pack.reasons[key]).map(key => <span key={key} className="block text-sm text-muted-foreground">
              {reasons(key)} {pack.reasons[key]}
            </span>)}
          </TableCell>
          <TableCell>{pack.hiddenAt ? t('hidden', { time: time(pack.hiddenAt) }) : ''}</TableCell>
          <TableCell>
            <Button variant="outline" size="sm" disabled={busy} aria-describedby={`admin-gallery-pack-${pack.id}`} onClick={() => void change(pack, pack.hiddenAt ? 'unhide' : 'hide')}>
              {pack.hiddenAt ? t('unhide') : t('hide')}
            </Button>
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>)}
    </CardContent>
  </Card>
}
