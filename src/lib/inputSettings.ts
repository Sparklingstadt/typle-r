"use client"
import { useSyncExternalStore } from 'react'

// Simple special-character input: whether a Latin letter without its accent counts for the accented one in practice.
// Remembered per browser; off by default.
export const SIMPLE_SPECIAL_INPUT_KEY = 'typle-r:simple-special-input'
const changeEvent = 'typle-r:simple-special-input-change'
// Kept here as well, so the toggle still works for this visit when browser storage is unavailable.
let fallback = false

function getSnapshot() {
  try { return localStorage.getItem(SIMPLE_SPECIAL_INPUT_KEY) === 'on' } catch { return fallback }
}

function subscribe(onChange: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === SIMPLE_SPECIAL_INPUT_KEY || event.key === null) onChange() }
  window.addEventListener('storage', storage)
  window.addEventListener(changeEvent, onChange)
  return () => {
    window.removeEventListener('storage', storage)
    window.removeEventListener(changeEvent, onChange)
  }
}

// Returns whether the browser saved the choice.
export function setSimpleSpecialInput(next: boolean) {
  fallback = next
  let saved = true
  try {
    if (next) localStorage.setItem(SIMPLE_SPECIAL_INPUT_KEY, 'on')
    else localStorage.removeItem(SIMPLE_SPECIAL_INPUT_KEY)
  } catch { saved = false }
  window.dispatchEvent(new Event(changeEvent))
  return saved
}

export function useSimpleSpecialInput() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
