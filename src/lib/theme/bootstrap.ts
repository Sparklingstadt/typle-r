export type ThemePreference = 'system' | 'light' | 'dark'
export const THEME_STORAGE_KEY = 'typle-r:theme:v1'
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// Runs before the first paint. Storage may be unavailable in privacy mode.
// Only fixed, application-owned values are embedded in this script.
export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  let preference = 'system';
  try {
    const stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch {}
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.classList.toggle('dark', preference === 'dark' ||
    (preference === 'system' && window.matchMedia('${SYSTEM_DARK_QUERY}').matches));
})();`
