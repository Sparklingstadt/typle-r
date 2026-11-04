"use client"
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eraser, LoaderCircle, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Kbd from '@/components/Practice/Kbd'
import type { InkStroke } from '@/core/handwriting'
import type { WritingLanguage } from '@/core/wordLists'
import { loadHandwritingRecognizer, type HandwritingRecognizer } from '@/lib/handwritingRecognizer'

// How long the pen rests before the writing is read by itself, and the stroke width, in CSS pixels.
const READ_DELAY = 600
const LINE_WIDTH = 5
// Writing shorter than this share of the pad's height is not stretched to the full line (a lone ㅡ, a dot).
const MIN_HEIGHT_SHARE = 0.25

// Once a pen has written on a pad, touches are taken for the hand resting on the screen and ignored for the visit.
let penSeen = false

type Status = 'loading' | 'ready' | 'failed'

// Typle Writing's own handwriting input, for languages the app reads itself: strokes drawn with a pen, a finger or a
// mouse are read in the browser (handwritingRecognizer.ts). A pause in the writing reads it silently (a match moves on,
// as the field's text does); 判定 reads it at once and counts a mistake when it does not match. Remounted for every word.
export default function HandwritingPad({ language, expected, onStart, onRead, onEscape, children }: {
  language: WritingLanguage
  // The word being copied, which the reading may settle on (readHandwriting).
  expected: string
  // The first stroke, which starts the clock.
  onStart: () => void
  onRead: (text: string, explicit: boolean) => void
  // Esc, which starts the list again as it does in the field.
  onEscape: () => void
  // More buttons after 判定 (飛ばす).
  children?: React.ReactNode
}) {
  const t = useTranslations('practice')
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<InkStroke[]>([])
  const active = useRef<{ id: number; stroke: InkStroke } | null>(null)
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

  // The canvas keeps the size it is shown at, in device pixels, and is drawn again when that changes.
  const repaint = useRef(() => {})
  useEffect(() => { repaint.current = redraw })
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const ratio = window.devicePixelRatio || 1
      element.width = Math.round(element.clientWidth * ratio)
      element.height = Math.round(element.clientHeight * ratio)
      repaint.current()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function context() {
    const element = canvas.current
    const drawing = element?.getContext('2d')
    if (!element || !drawing) return null
    const ratio = element.width / Math.max(element.clientWidth, 1)
    drawing.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawing.lineCap = 'round'
    drawing.lineJoin = 'round'
    drawing.lineWidth = LINE_WIDTH
    drawing.strokeStyle = drawing.fillStyle = getComputedStyle(element).color
    return drawing
  }

  function drawStroke(drawing: CanvasRenderingContext2D, stroke: InkStroke, from = 0) {
    if (stroke.length === 1) {
      drawing.beginPath()
      drawing.arc(stroke[0].x, stroke[0].y, LINE_WIDTH / 2, 0, Math.PI * 2)
      drawing.fill()
      return
    }
    drawing.beginPath()
    const start = stroke[Math.max(from - 1, 0)]
    drawing.moveTo(start.x, start.y)
    for (const point of stroke.slice(Math.max(from, 1))) drawing.lineTo(point.x, point.y)
    drawing.stroke()
  }

  function redraw() {
    const drawing = context()
    const element = canvas.current
    if (!drawing || !element) return
    drawing.clearRect(0, 0, element.clientWidth, element.clientHeight)
    for (const stroke of strokes.current) drawStroke(drawing, stroke)
    if (active.current) drawStroke(drawing, active.current.stroke)
  }

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

  return <div className="flex w-full max-w-xl flex-col gap-2">
    <div className="relative rounded-lg bg-background dark:bg-input/30">
      {/* A guide for the middle of the line, behind the writing, and what the pad is for while it is empty. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-1/2 border-t border-dashed border-border" />
      <canvas ref={canvas} id="writingPad" role="img" aria-label={t('writingPad')}
        className="relative block h-44 w-full touch-none rounded-lg border text-foreground select-none sm:h-52"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onContextMenu={event => event.preventDefault()} />
      {strokeCount === 0 && status === 'ready' &&
        <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm text-muted-foreground">{t('writingPadHint')}</p>}
      {status !== 'ready' &&
        <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-background/80 px-4 text-center text-sm text-muted-foreground">
          {status === 'loading'
            ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t('writingPadLoading')}</>
            : <span className="flex flex-col items-center gap-2">{t('writingPadFailed')}
              <Button variant="outline" size="sm" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{t('writingPadRetry')}</Button></span>}
        </div>}
    </div>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="lg" className="h-12" onClick={undo} disabled={strokeCount === 0}><Undo2 aria-hidden="true" />{t('writingPadUndo')}</Button>
      <Button variant="outline" size="lg" className="h-12" onClick={clear} disabled={strokeCount === 0}><Eraser aria-hidden="true" />{t('writingPadClear')}</Button>
      <Button size="lg" className="h-12" onClick={() => { void read(true) }} disabled={status !== 'ready'} aria-label={t('writingJudge')} aria-keyshortcuts="Enter">
        {t('writingJudge')}<Kbd className="hidden sm:inline-flex">Enter</Kbd>
      </Button>
      {children}
    </div>
  </div>
}
