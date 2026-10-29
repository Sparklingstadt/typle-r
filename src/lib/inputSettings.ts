"use client"
import { useSyncExternalStore } from 'react'
import type { TypingOptions } from '../core/typing'

// How practice matches typed characters, remembered per browser; every option is off by default.
// simpleSpecial: a Latin letter without its accent counts for the accented one. ignoreCase: upper and lower case count as the same.
export const INPUT_SETTINGS = {
  simpleSpecial: { key: 'typle-r:simple-special-input', option: 'ignoreAccents' },
  ignoreCase: { key: 'typle-r:ignore-case', option: 'ignoreCase' },
} as const satisfies Record<string, { key: string; option: keyof TypingOptions }>
export type InputSetting = keyof typeof INPUT_SETTINGS

const changeEvent = 'typle-r:input-settings-change'
// Kept here as well, so a toggle still works for this visit when browser storage is unavailable.
const fallback: Partial<Record<InputSetting, boolean>> = {}

function read(setting: InputSetting) {
  try { return localStorage.getItem(INPUT_SETTINGS[setting].key) === 'on' } catch { return fallback[setting] ?? false }
}

function subscribe(onChange: () => void) {
  const keys: string[] = Object.values(INPUT_SETTINGS).map(setting => setting.key)
  const storage = (event: StorageEvent) => { if (event.key === null || keys.includes(event.key)) onChange() }
  window.addEventListener('storage', storage)
  window.addEventListener(changeEvent, onChange)
  return () => {
    window.removeEventListener('storage', storage)
    window.removeEventListener(changeEvent, onChange)
  }
}

// Returns whether the browser saved the choice.
export function setInputSetting(setting: InputSetting, next: boolean) {
  fallback[setting] = next
  let saved = true
  try {
    if (next) localStorage.setItem(INPUT_SETTINGS[setting].key, 'on')
    else localStorage.removeItem(INPUT_SETTINGS[setting].key)
  } catch { saved = false }
  window.dispatchEvent(new Event(changeEvent))
  return saved
}

export function useInputSetting(setting: InputSetting) {
  return useSyncExternalStore(subscribe, () => read(setting), () => false)
}

// The typing options the settings turn on.
export function useTypingOptions(): TypingOptions {
  return { ignoreAccents: useInputSetting('simpleSpecial'), ignoreCase: useInputSetting('ignoreCase') }
}
