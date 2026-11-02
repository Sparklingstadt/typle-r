"use client"
import { useCallback, useState } from 'react'
import type { PracticeMode } from '../core/records'

// Whether a list marked for writing is practised by typing or by handwriting. Remembered per browser; typing by default.
export const WRITING_MODE_KEY = 'typle-r:writing-mode'

function read(): PracticeMode {
  try { return localStorage.getItem(WRITING_MODE_KEY) === 'writing' ? 'writing' : 'typing' } catch { return 'typing' }
}

export function useWritingMode() {
  const [mode, setMode] = useState<PracticeMode>(read)
  const choose = useCallback((next: PracticeMode) => {
    setMode(next)
    try { localStorage.setItem(WRITING_MODE_KEY, next) } catch { /* The choice still holds for this visit when browser storage is unavailable. */ }
  }, [])
  return [mode, choose] as const
}

// A list without the mark is always typed, whatever was chosen before.
export function practiceMode(list: { writing?: unknown } | undefined, preferred: PracticeMode): PracticeMode {
  return list?.writing && preferred === 'writing' ? 'writing' : 'typing'
}
