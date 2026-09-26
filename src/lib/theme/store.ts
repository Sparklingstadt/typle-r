import { parseThemePreference, SYSTEM_DARK_QUERY, THEME_STORAGE_KEY, type ThemePreference } from './bootstrap'

const changeEvent = 'typle-r:theme-change'
export const getServerSnapshot = (): ThemePreference => 'system'
export const getSnapshot = () => parseThemePreference(document.documentElement.dataset.themePreference)

function apply(preference: ThemePreference) {
  const root = document.documentElement
  root.dataset.themePreference = preference
  root.classList.toggle('dark', preference === 'dark' ||
    (preference === 'system' && window.matchMedia(SYSTEM_DARK_QUERY).matches))
}

export function setTheme(preference: ThemePreference): boolean {
  apply(preference)
  let saved = true
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch { saved = false }
  window.dispatchEvent(new Event(changeEvent))
  return saved
}

export function subscribe(onChange: () => void) {
  const media = window.matchMedia(SYSTEM_DARK_QUERY)
  const sync = () => { apply(getSnapshot()); onChange() }
  const storage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    try { if (event.storageArea !== localStorage) return } catch { return }
    apply(parseThemePreference(event.newValue))
    onChange()
  }
  sync()
  media.addEventListener('change', sync)
  window.addEventListener('storage', storage)
  window.addEventListener(changeEvent, onChange)
  window.addEventListener('pageshow', sync)
  return () => {
    media.removeEventListener('change', sync)
    window.removeEventListener('storage', storage)
    window.removeEventListener(changeEvent, onChange)
    window.removeEventListener('pageshow', sync)
  }
}
