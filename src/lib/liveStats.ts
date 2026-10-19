"use client"
import { useCallback, useEffect, useState } from 'react'

// Whether the practice card shows the live elapsed time, speed, accuracy and mistakes. Remembered per browser; shown by default.
export const LIVE_STATS_KEY = 'typle-r:live-stats'

export function useLiveStatsVisible() {
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(LIVE_STATS_KEY) !== 'hidden' } catch { return true }
  })
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === LIVE_STATS_KEY || event.key === null) setVisible(event.newValue !== 'hidden')
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  const choose = useCallback((next: boolean) => {
    setVisible(next)
    try {
      if (next) localStorage.removeItem(LIVE_STATS_KEY)
      else localStorage.setItem(LIVE_STATS_KEY, 'hidden')
    } catch { /* The toggle still works when browser storage is unavailable. */ }
  }, [])
  return [visible, choose] as const
}
