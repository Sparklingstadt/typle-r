"use client"
import { useCallback, useState } from 'react'

// Whether a list marked for writing is practised by typing or by handwriting. Remembered per browser; typing by default,
// and only `writing` is written (as the recall switch does in practiceMode.ts).
export const WRITING_MODE_KEY = 'typle-r:writing-mode'

export type WritingChoice = 'normal' | 'writing'

function read(): WritingChoice {
  try { return localStorage.getItem(WRITING_MODE_KEY) === 'writing' ? 'writing' : 'normal' } catch { return 'normal' }
}

export function useWritingMode() {
  const [mode, setMode] = useState<WritingChoice>(read)
  const choose = useCallback((next: WritingChoice) => {
    setMode(next)
    try {
      if (next === 'writing') localStorage.setItem(WRITING_MODE_KEY, 'writing')
      else localStorage.removeItem(WRITING_MODE_KEY)
    } catch { /* The choice still holds for this visit when browser storage is unavailable. */ }
  }, [])
  return [mode, choose] as const
}

// A list without the mark is always typed, whatever was chosen before.
export function practiceMode(list: { writing?: unknown } | undefined, preferred: WritingChoice): WritingChoice {
  return list?.writing && preferred === 'writing' ? 'writing' : 'normal'
}
