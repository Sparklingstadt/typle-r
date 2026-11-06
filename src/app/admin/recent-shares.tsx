"use client"
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Overview } from './overview'

export default function RecentShares({ shares, time }: { shares: Overview['recentShares']; time: (value: string) => string }) {
  const t = useTranslations('admin')
  return <Card>
    <CardHeader><CardTitle><h2>{t('shares.title')}</h2></CardTitle></CardHeader>
    <CardContent>
      {shares.length === 0 ? <p>{t('shares.empty')}</p> : <Table>
        <TableHeader><TableRow>
          <TableHead>{t('shares.name')}</TableHead>
          <TableHead>{t('shares.owner')}</TableHead>
          <TableHead>{t('updatedAt')}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{shares.map(row => <TableRow key={row.id}>
          <TableCell><a className="underline" href={`/shared/${row.id}`}>{row.name || t('shares.unnamed')}</a></TableCell>
          <TableCell className="font-mono">{row.ownerId}</TableCell>
          <TableCell>{time(row.updatedAt)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent>
  </Card>
}
