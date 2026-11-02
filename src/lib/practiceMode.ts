"use client"
import { useCallback, useEffect, useState } from 'react'
import type { PracticeMode } from '../core/records'

// How the practice screen asks for the words: normal shows the answer, recall hides it. Remembered per browser and
// synced across tabs; only `recall` is written, so normal is the default.
export const PRACTICE_MODE_KEY = 'typle-r:practice-mode'

const modeOf = (value: string | null): PracticeMode => value === 'recall' ? 'recall' : 'normal'

export function usePracticeMode(): [PracticeMode, (mode: PracticeMode) => boolean] {
  const [mode, setMode] = useState<PracticeMode>(() => {
    try { return modeOf(localStorage.getItem(PRACTICE_MODE_KEY)) } catch { return 'normal' }
  })
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === PRACTICE_MODE_KEY || event.key === null) setMode(modeOf(event.newValue))
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  // Returns whether the choice was remembered; the mode still changes for this page when browser storage is unavailable.
  const choose = useCallback((next: PracticeMode) => {
    setMode(next)
    try {
      if (next === 'recall') localStorage.setItem(PRACTICE_MODE_KEY, 'recall')
      else localStorage.removeItem(PRACTICE_MODE_KEY)
      return true
    } catch { return false }
  }, [])
  return [mode, choose]
}
