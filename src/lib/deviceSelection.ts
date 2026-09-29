"use client"
import { useCallback, useEffect, useState } from 'react'

// The device used for practice is remembered per browser (and per account), so each computer keeps its own choice.
export function selectedDeviceKey(accountId: string) {
  return `typle-r:device:${accountId}`
}

export function useSelectedDevice(accountId: string) {
  const key = selectedDeviceKey(accountId)
  const [id, setId] = useState(() => {
    try { return localStorage.getItem(key) ?? '' } catch { return '' }
  })
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === key || event.key === null) setId(event.newValue ?? '')
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [key])
  const choose = useCallback((next: string) => {
    setId(next)
    try { localStorage.setItem(key, next) } catch { /* Selection still works when browser storage is unavailable. */ }
  }, [key])
  return [id, choose] as const
}
