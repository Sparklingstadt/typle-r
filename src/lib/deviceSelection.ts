"use client"
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { chosenDevice, type PracticeDevice } from '@/core/devices'

// The device used for practice is remembered per browser (and per account), so each computer keeps its own choice.
export function selectedDeviceKey(accountId: string) {
  return `typle-r:device:${accountId}`
}

/** The stored choice: a device id, '' for 未選択, or null when this browser has not chosen yet. */
export function useSelectedDevice(accountId: string) {
  const key = selectedDeviceKey(accountId)
  const [id, setId] = useState<string | null>(() => {
    try { return localStorage.getItem(key) } catch { return null }
  })
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === key || event.key === null) setId(event.newValue)
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

/** The device this browser practises on: the built-in デフォルト until another is chosen, or none for 未選択. */
export function useChosenDevice(accountId: string, devices: PracticeDevice[]) {
  const [id, choose] = useSelectedDevice(accountId)
  const defaultName = useTranslations('format')('defaultDevice')
  return [chosenDevice(devices, id, defaultName), choose] as const
}
