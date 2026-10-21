import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { localDevelopmentEnabled } from '@/lib/localDevelopment'
import LocalLoginForm from './local-login-form'

export const dynamic = 'force-dynamic'

export default async function LocalLoginPage() {
  if (!localDevelopmentEnabled()) notFound()
  const t = await getTranslations('account.localLogin')
  return <main className="mx-auto max-w-xl space-y-6 p-8">
    <h1 className="text-2xl font-bold">{t('title')}</h1>
    <p>{t('description')}</p>
    <LocalLoginForm />
  </main>
}
