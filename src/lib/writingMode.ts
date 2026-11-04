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

// How handwriting reaches the app for languages it reads itself (hasHandwritingModel): the in-app handwriting pad, or a
// text field for the OS's handwriting input. Remembered per browser; the pad by default, and only `field` is written.
export const WRITING_INPUT_KEY = 'typle-r:writing-input'

export type WritingInput = 'pad' | 'field'

export function useWritingInput() {
  const [input, setInput] = useState<WritingInput>(() => {
    try { return localStorage.getItem(WRITING_INPUT_KEY) === 'field' ? 'field' : 'pad' } catch { return 'pad' }
  })
  const choose = useCallback((next: WritingInput) => {
    setInput(next)
    try {
      if (next === 'field') localStorage.setItem(WRITING_INPUT_KEY, 'field')
      else localStorage.removeItem(WRITING_INPUT_KEY)
    } catch { /* The choice still holds for this visit when browser storage is unavailable. */ }
  }, [])
  return [input, choose] as const
}
