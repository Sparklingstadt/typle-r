import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import LanguageSettings from '@/components/Settings/LanguageSettings'
import SessionSettings from '@/components/Settings/SessionSettings'
import { PageMain } from '@/components/ui/page-layout'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: t('metaTitle'), description: t('description') }
}

export default async function Settings() {
  const t = await getTranslations('settings')
  return <PageMain width="narrow">
    <header className="mb-6 space-y-1">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </header>
    <div className="space-y-6">
      <LanguageSettings />
      <SessionSettings />
    </div>
  </PageMain>
}
