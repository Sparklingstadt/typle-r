"use client"
import type { InferenceSession, Tensor } from 'onnxruntime-web'
import { inkBounds, inkLayout, LINE_HEIGHT, lineTensor, readHandwriting, recognitionClasses, type InkStroke } from '../core/handwriting'
import type { WritingLanguage } from '../core/wordLists'

// Reads the handwriting pad's strokes in the browser, with no service and no OS input: onnxruntime-web runs a PaddleOCR
// recognition model served from public/handwriting (see the README there). The runtime and the model are only fetched
// when a pad is first shown, and kept for the rest of the visit.

type Model = { model: string; dictionary: string }

const MODELS: Partial<Record<WritingLanguage, Model>> = {
  ko: { model: '/handwriting/ko/korean_PP-OCRv5_mobile_rec.onnx', dictionary: '/handwriting/ko/ppocrv5_korean_dict.txt' },
}

/** Whether the app can read handwriting in this language itself. */
export function hasHandwritingModel(language: WritingLanguage): boolean {
  return MODELS[language] !== undefined
}

export type HandwritingRecognizer = {
  /** What the strokes read as; `expected` is the word being copied (see readHandwriting). */
  read(strokes: InkStroke[], options: { minHeight: number; lineWidth: number; expected?: string }): Promise<{ text: string; accepted: boolean }>
}

const loading = new Map<WritingLanguage, Promise<HandwritingRecognizer>>()

/** The recogniser for the language, loaded once; a failed load is forgotten, so the next call tries again. */
export function loadHandwritingRecognizer(language: WritingLanguage): Promise<HandwritingRecognizer> {
  const model = MODELS[language]
  if (!model) return Promise.reject(new Error(`No handwriting model for ${language}`))
  let recognizer = loading.get(language)
  if (!recognizer) {
    recognizer = load(model)
    recognizer.catch(() => loading.delete(language))
    loading.set(language, recognizer)
  }
  return recognizer
}

async function load({ model, dictionary }: Model): Promise<HandwritingRecognizer> {
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.wasmPaths = '/handwriting/ort/'
  // Threads need a cross-origin isolated page, which the app is not; one thread reads a word in a few milliseconds.
  ort.env.wasm.numThreads = 1
  const [session, classes] = await Promise.all([
    fetch(model).then(response => {
      if (!response.ok) throw new Error(`Handwriting model: HTTP ${response.status}`)
      return response.arrayBuffer()
    }).then(buffer => ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] })),
    fetch(dictionary).then(response => {
      if (!response.ok) throw new Error(`Handwriting dictionary: HTTP ${response.status}`)
      return response.text()
    }).then(recognitionClasses),
  ])
  return {
    async read(strokes, { minHeight, lineWidth, expected }) {
      const bounds = inkBounds(strokes)
      if (!bounds) return { text: '', accepted: false }
      const layout = inkLayout(bounds, minHeight)
      const canvas = document.createElement('canvas')
      canvas.width = layout.width
      canvas.height = LINE_HEIGHT
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('No 2D canvas')
      drawLine(context, strokes, layout, lineWidth)
      const pixels = context.getImageData(0, 0, layout.width, LINE_HEIGHT).data
      const input = new ort.Tensor('float32', lineTensor(pixels, layout.width), [1, 3, LINE_HEIGHT, layout.width])
      const result = await run(session, input)
      const [, steps, count] = result.dims
      return readHandwriting({ probabilities: result.data as Float32Array, steps, classes: count }, classes, expected)
    },
  }
}

async function run(session: InferenceSession, input: Tensor): Promise<Tensor> {
  const outputs = await session.run({ [session.inputNames[0]]: input })
  return outputs[session.outputNames[0]]
}

// Black strokes on white, at the line's scale; `lineWidth` is the stroke width in the pad's units.
function drawLine(context: CanvasRenderingContext2D, strokes: InkStroke[], layout: ReturnType<typeof inkLayout>, lineWidth: number) {
  context.fillStyle = '#fff'
  context.fillRect(0, 0, layout.width, LINE_HEIGHT)
  context.strokeStyle = '#000'
  context.fillStyle = '#000'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  // Not thinner than about the strokes of printed text at this height, which the model was trained on.
  context.lineWidth = Math.max(lineWidth * layout.scale, 2.5)
  for (const stroke of strokes) {
    const points = stroke.map(layout.map)
    if (points.length === 1) {
      context.beginPath()
      context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
}
