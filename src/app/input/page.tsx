import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import InputSettings from '@/components/Settings/InputSettings'
import SimpleInputTable from '@/components/Settings/SimpleInputTable'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('input')
  return { title: t('metaTitle'), description: t('description') }
}

export default async function Input() {
  const t = await getTranslations('input')
  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 space-y-1">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </header>
    <div className="space-y-6">
      <InputSettings setting="simpleSpecial" />
      <InputSettings setting="ignoreCase" />
      <SimpleInputTable />
    </div>
  </main>
}
