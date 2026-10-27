import { Suspense } from 'react'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { clientMessages, type Messages } from '@/i18n/messages'
import AdminDashboard from './admin-dashboard'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// The dashboard is read in the browser from /api/admin/dashboard, which only the administrator's cookie opens. Its
// messages reach the browser on this page only.
export default async function AdminPage() {
  const messages = await getMessages() as Messages
  return <NextIntlClientProvider messages={{ ...clientMessages(messages), admin: messages.admin }}>
    <Suspense><AdminDashboard /></Suspense>
  </NextIntlClientProvider>
}
