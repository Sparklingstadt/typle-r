'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config'
import ja from '@/messages/ja/globalError.json'
import en from '@/messages/en/globalError.json'
import zhCN from '@/messages/zh-CN/globalError.json'
import zhTW from '@/messages/zh-TW/globalError.json'
import ru from '@/messages/ru/globalError.json'
import fr from '@/messages/fr/globalError.json'

// This replaces the root layout, so the message provider is not available; the few texts are bundled here instead.
const messages: Record<Locale, typeof ja> = { ja, en, 'zh-CN': zhCN, 'zh-TW': zhTW, ru, fr }

function cookieLocale(): Locale {
  const value = document.cookie.split('; ').find(item => item.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1)
  return isLocale(value) ? value : defaultLocale
}

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  const [locale] = useState(() => typeof document === 'undefined' ? defaultLocale : cookieLocale())
  const t = messages[locale]

  return (
    <html lang={locale}>
      <body>
        <main style={{ maxWidth: 560, margin: '15vh auto', padding: 24, fontFamily: 'sans-serif' }}>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
          <button onClick={() => window.location.reload()}>{t.reload}</button>
        </main>
      </body>
    </html>
  )
}
