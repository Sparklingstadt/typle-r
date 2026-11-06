"use client"
import { useEffect, useRef, useState } from 'react'
import type { WritingLanguage } from '@/core/wordLists'
import { loadHandwritingRecognizer, type HandwritingRecognizer } from '@/lib/handwritingRecognizer'
import { LINE_WIDTH, useInkCanvas } from '@/lib/useInkCanvas'

// How long the pen rests before the writing is read by itself, in milliseconds.
const READ_DELAY = 600
// Writing shorter than this share of the pad's height is not stretched to the full line (a lone ㅡ, a dot).
const MIN_HEIGHT_SHARE = 0.25

// Once a pen has written on a pad, touches are taken for the hand resting on the screen and ignored for the visit.
let penSeen = false

type Status = 'loading' | 'ready' | 'failed'

// What HandwritingPad does with the strokes: taking them from the pointer and the keyboard, and reading them with the
// recognizer. A pause in the writing reads it silently; `read(true)` reads it at once.
export function useHandwritingPad({ language, expected, onStart, onRead, onEscape }: {
  language: WritingLanguage
  expected: string
  onStart: () => void
  onRead: (text: string, explicit: boolean) => void
  onEscape: () => void
}) {
  const { canvas, strokes, active, context, drawStroke, redraw } = useInkCanvas()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Readings are numbered, so that one finishing after newer strokes (or after the pad is gone) is dropped.
  const reading = useRef(0)
  const recognizer = useRef<HandwritingRecognizer | null>(null)
  const callbacks = useRef({ onStart, onRead, onEscape })
  const [status, setStatus] = useState<Status>('loading')
  const [strokeCount, setStrokeCount] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => { callbacks.current = { onStart, onRead, onEscape } })

  // The keys of the field: Enter judges, Esc starts again, and ⌘Z / Ctrl+Z takes back a stroke. Keys typed into a field
  // or on a focused button are left to them.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = event => {
      if (event.defaultPrevented || event.isComposing) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, [role="radio"], [contenteditable="true"]')) return
      if (event.key === 'Enter') { event.preventDefault(); void read(true) }
      else if (event.key === 'Escape') { event.preventDefault(); callbacks.current.onEscape() }
      else if (event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey) { event.preventDefault(); undo() }
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  useEffect(() => {
    let current = true
    loadHandwritingRecognizer(language).then(
      loaded => { if (current) { recognizer.current = loaded; setStatus('ready') } },
      error => { if (current) { console.error(error); setStatus('failed') } })
    return () => { current = false }
  }, [language, attempt])

  useEffect(() => () => {
    reading.current++
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function changed() {
    setStrokeCount(strokes.current.length)
    redraw()
  }

  function cancelReading() {
    reading.current++
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  async function read(explicit: boolean) {
    cancelReading()
    const number = reading.current
    const element = canvas.current
    if (!recognizer.current || !element) return
    if (strokes.current.length === 0) {
      if (explicit) callbacks.current.onRead('', true)
      return
    }
    try {
      const { text } = await recognizer.current.read(strokes.current, { minHeight: element.clientHeight * MIN_HEIGHT_SHARE, lineWidth: LINE_WIDTH, expected })
      if (number === reading.current) callbacks.current.onRead(text, explicit)
    } catch (error) {
      console.error(error)
      if (number === reading.current) setStatus('failed')
    }
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (status !== 'ready' || active.current) return
    if (event.pointerType === 'pen') penSeen = true
    else if (event.pointerType === 'touch' && penSeen) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    cancelReading()
    if (strokes.current.length === 0) callbacks.current.onStart()
    active.current = { id: event.pointerId, stroke: [point(event)] }
    redraw()
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = active.current
    if (!current || current.id !== event.pointerId) return
    event.preventDefault()
    // Pens report more points between frames than the event carries; they all go into the stroke.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? []
    const box = event.currentTarget.getBoundingClientRect()
    const from = current.stroke.length
    for (const each of events.length ? events : [event.nativeEvent]) current.stroke.push({ x: each.clientX - box.left, y: each.clientY - box.top })
    const drawing = context()
    if (drawing) drawStroke(drawing, current.stroke, from)
  }

  function up(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = active.current
    if (!current || current.id !== event.pointerId) return
    active.current = null
    strokes.current = [...strokes.current, current.stroke]
    changed()
    timer.current = setTimeout(() => { void read(false) }, READ_DELAY)
  }

  function undo() {
    cancelReading()
    strokes.current = strokes.current.slice(0, -1)
    changed()
    if (strokes.current.length) timer.current = setTimeout(() => { void read(false) }, READ_DELAY)
  }

  function clear() {
    cancelReading()
    strokes.current = []
    changed()
  }

  function retry() {
    setStatus('loading')
    setAttempt(value => value + 1)
  }

  return { canvas, status, strokeCount, read, undo, clear, retry, down, move, up }
}
