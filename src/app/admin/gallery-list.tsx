"use client"
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// The answer of GET /api/admin/gallery (server/internal/web/admin.go, server/internal/store/gallery.go), the most reported packs first.
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
  const shares = useTranslations('admin.shares')
  const reasons = useTranslations('wordLists.report.reasons')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [actionFailed, setActionFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchPacks = useCallback(async (): Promise<State> => {
    try {
      const response = await fetch('/api/admin/gallery', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (response.ok) return { kind: 'ready', packs: (body as { packs: Pack[] }).packs }
      return { kind: 'failed', error: errorText(body?.error) }
    } catch {
      return { kind: 'failed', error: errorText(null) }
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
      const response = await fetch(`/api/admin/gallery/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pack.id }),
      })
      if (!response.ok) {
        // The owner may have stopped sharing meanwhile (404): show the server's reason and re-read the list.
        const body = await response.json().catch(() => null)
        setActionFailed(errorText(body?.error))
        setState(await fetchPacks())
        return
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
      {actionFailed && <Alert variant="destructive"><AlertDescription>{actionFailed}</AlertDescription></Alert>}
      {state.kind === 'loading' && <p role="status">{t('loading')}</p>}
      {state.kind === 'failed' && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
        {state.error}<Button variant="outline" size="sm" onClick={() => { setState({ kind: 'loading' }); void fetchPacks().then(setState) }}>{t('retry')}</Button>
      </AlertDescription></Alert>}
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
          <TableCell className="text-right tabular-nums">{pack.added.toLocaleString()}</TableCell>
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
