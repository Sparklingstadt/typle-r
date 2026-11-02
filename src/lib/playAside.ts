"use client"
import { useCallback, useEffect, useState } from 'react'

// Whether the practice screen shows its side panel (word lists and best records). Remembered per browser; shown by default.
export const PLAY_ASIDE_KEY = 'typle-r:play-aside'

export function usePlayAsideOpen() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(PLAY_ASIDE_KEY) !== 'collapsed' } catch { return true }
  })
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === PLAY_ASIDE_KEY || event.key === null) setOpen(event.newValue !== 'collapsed')
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  const choose = useCallback((next: boolean) => {
    setOpen(next)
    try {
      if (next) localStorage.removeItem(PLAY_ASIDE_KEY)
      else localStorage.setItem(PLAY_ASIDE_KEY, 'collapsed')
    } catch { /* The toggle still works when browser storage is unavailable. */ }
  }, [])
  return [open, choose] as const
}
