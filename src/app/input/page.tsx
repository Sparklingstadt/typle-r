import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import InputSettings from '@/components/Settings/InputSettings'
import SimpleInputTable from '@/components/Settings/SimpleInputTable'
import { PageMain } from '@/components/ui/page-layout'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('input')
  return { title: t('metaTitle'), description: t('description') }
}

export default async function Input() {
  const t = await getTranslations('input')
  return <PageMain width="narrow">
    <header className="mb-6 space-y-1">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </header>
    <div className="space-y-6">
      <InputSettings setting="simpleSpecial" />
      <InputSettings setting="ignoreCase" />
      <SimpleInputTable />
    </div>
  </PageMain>
}
