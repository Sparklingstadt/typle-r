"use client"
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Overview } from './overview'

export default function AdminList({ admins, time }: { admins: Overview['admins']; time: (value: string | null) => string }) {
  const t = useTranslations('admin')
  return <Card>
    <CardHeader><CardTitle><h2>{t('admins.title')}</h2></CardTitle></CardHeader>
    <CardContent><Table>
      <TableHeader><TableRow>
        <TableHead>{t('admins.email')}</TableHead>
        <TableHead>{t('admins.ffpfSub')}</TableHead>
        <TableHead>{t('admins.createdAt')}</TableHead>
        <TableHead>{t('admins.lastSeenAt')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>{admins.map(row => <TableRow key={row.email}>
        <TableCell className="font-mono">{row.email}</TableCell>
        <TableCell className="font-mono">{row.ffpfSub ?? t('admins.unbound')}</TableCell>
        <TableCell>{time(row.createdAt)}</TableCell>
        <TableCell>{time(row.lastSeenAt)}</TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent>
  </Card>
}
