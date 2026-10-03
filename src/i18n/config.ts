export const locales = ['ja', 'en', 'zh-CN', 'zh-TW', 'ru', 'fr'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'ja'
export const LOCALE_COOKIE = 'NEXT_LOCALE'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale)
}

// Each language is named in itself, so it can be found whatever language the screen is in.
export const localeNames: Record<Locale, string> = {
  ja: '日本語', // i18n-ignore
  en: 'English',
  'zh-CN': '简体中文', // i18n-ignore
  'zh-TW': '繁體中文', // i18n-ignore
  ru: 'Русский',
  fr: 'Français',
}

// Open Graph uses language_TERRITORY.
export const openGraphLocales: Record<Locale, string> = {
  ja: 'ja_JP', en: 'en_US', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', ru: 'ru_RU', fr: 'fr_FR',
}
