"use client"
import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { stats, type Overview } from './overview'

export default function StatCards({ overview }: { overview: Overview }) {
  const t = useTranslations('admin')
  const format = useFormat()
  return <section aria-label={t('stats.label')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
    {stats.map(key => <Card key={key} className="gap-2 py-4">
      <CardHeader className="px-4"><CardDescription>{t(`stats.${key}`)}</CardDescription></CardHeader>
      <CardContent className="px-4 text-3xl font-bold tabular-nums">{format.number(overview[key])}</CardContent>
    </Card>)}
  </section>
}
