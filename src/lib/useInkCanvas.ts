"use client"
import { useEffect, useRef } from 'react'
import type { InkStroke } from '@/core/handwriting'

// The stroke width, in CSS pixels.
export const LINE_WIDTH = 5

// The canvas of the handwriting pad and the strokes on it: the finished ones and the one being drawn.
export function useInkCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<InkStroke[]>([])
  const active = useRef<{ id: number; stroke: InkStroke } | null>(null)

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

  return { canvas, strokes, active, context, drawStroke, redraw }
}
