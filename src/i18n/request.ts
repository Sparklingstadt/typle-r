import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config'
import { loadMessages } from './messages'

// The language is a per-browser setting kept in a cookie, so URLs stay the same in every language.
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(value) ? value : defaultLocale
  return { locale, messages: await loadMessages(locale) }
})
