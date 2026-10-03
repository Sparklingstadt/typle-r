import type { Locale } from './config'
import type ja from '@/messages/ja'

export type Messages = typeof ja

const loaders: Record<Locale, () => Promise<{ default: Messages }>> = {
  ja: () => import('@/messages/ja'),
  en: () => import('@/messages/en'),
  'zh-CN': () => import('@/messages/zh-CN'),
  'zh-TW': () => import('@/messages/zh-TW'),
  ru: () => import('@/messages/ru'),
  fr: () => import('@/messages/fr'),
}

export async function loadMessages(locale: Locale) {
  return (await loaders[locale]()).default
}
