"use client"
import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_PROFILE_ID } from './profiles'

// Like the practice device, the profile in use is remembered per browser (and per account).
export function selectedProfileKey(accountId: string) {
  return `typle-r:profile:${accountId}`
}

const changedEvent = 'typle-r:profile-selected'
// Keeps the choice for this page view when browser storage is unavailable.
const memory = new Map<string, string>()

function subscribe(notify: () => void) {
  window.addEventListener('storage', notify)
  window.addEventListener(changedEvent, notify)
  return () => {
    window.removeEventListener('storage', notify)
    window.removeEventListener(changedEvent, notify)
  }
}

export function readSelectedProfile(accountId: string) {
  const key = selectedProfileKey(accountId)
  try { return localStorage.getItem(key) || DEFAULT_PROFILE_ID } catch { return memory.get(key) || DEFAULT_PROFILE_ID }
}

export function useSelectedProfile(accountId: string | undefined) {
  const id = useSyncExternalStore(subscribe, () => accountId ? readSelectedProfile(accountId) : DEFAULT_PROFILE_ID, () => DEFAULT_PROFILE_ID)
  const choose = useCallback((next: string) => {
    if (!accountId) return
    const key = selectedProfileKey(accountId)
    try { localStorage.setItem(key, next) } catch { memory.set(key, next) }
    window.dispatchEvent(new Event(changedEvent))
  }, [accountId])
  return [id, choose] as const
}
