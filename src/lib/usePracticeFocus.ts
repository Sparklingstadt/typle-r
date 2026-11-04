"use client"
import { useEffect, useRef, type RefObject } from 'react'
import type { PracticeMode } from '../core/records'
import type { WritingChoice } from './writingMode'

export function usePracticeFocus({ mode, finished, input, showResume, writingChoice }: {
  mode: PracticeMode
  finished: boolean
  input: RefObject<HTMLInputElement | null>
  showResume: boolean
  writingChoice: WritingChoice
}) {
  // Set when handwriting is switched off, so the typing input takes the focus once it is mounted again.
  const focusTypingOnMount = useRef(false)
  const pickerOpener = useRef<HTMLElement | null>(null)

  // While the input has lost focus, any printable key or Enter outside another control brings it back.
  useEffect(() => {
    if (!showResume) return
    function resume(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
      if (event.key.length !== 1 && event.key !== 'Enter') return
      event.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', resume)
    return () => document.removeEventListener('keydown', resume)
  }, [showResume, input])

  // Back from handwriting, the typing input only exists after this render, so it is focused here rather than on the click.
  useEffect(() => {
    if (writingChoice !== 'normal' || !focusTypingOnMount.current) return
    focusTypingOnMount.current = false
    input.current?.focus()
  }, [writingChoice, input])

  // The typing input, or the writing field (which WritingPractice owns) while writing.
  function focusInput() {
    if (mode === 'writing') document.getElementById('writingInputField')?.focus()
    else input.current?.focus()
  }
  // After a dialog or menu closes, typing continues in the input; on the result screen focus returns to the trigger.
  function focusPractice(event: Event) {
    if (finished && mode !== 'writing') return
    if (mode === 'writing' && !document.getElementById('writingInputField')) return
    event.preventDefault()
    focusInput()
  }
  // The picker is opened from buttons that are not its Radix trigger, so remember where focus should return.
  function rememberOpener() {
    pickerOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  function closePicker(event: Event) {
    event.preventDefault()
    if ((mode !== 'writing' && finished) || (mode === 'writing' && !document.getElementById('writingInputField'))) pickerOpener.current?.focus()
    else focusInput()
  }
  // Back from handwriting to typing, the input takes the focus once it is mounted again.
  function focusTypingNext() {
    focusTypingOnMount.current = true
  }

  return { focusInput, focusPractice, rememberOpener, closePicker, focusTypingNext }
}
