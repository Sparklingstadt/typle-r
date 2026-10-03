'use server'
import { cookies } from 'next/headers'
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from './config'

export async function setLocale(locale: string) {
  if (!isLocale(locale)) throw new Error('Unsupported locale')
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax' })
}
