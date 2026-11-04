// Reading handwriting drawn in the app, for Typle Writing without the OS's handwriting input. The strokes are drawn into
// one text line image and read by a CTC text recogniser (PaddleOCR's recognition models); this file holds the parts
// that do not need the browser: the strokes' bounds and scale, the image as the model's input, and reading its output.

/** A point of a stroke, in the pad's own coordinates. */
export type InkPoint = { x: number; y: number }
/** The points of one stroke, from pen down to pen up. */
export type InkStroke = InkPoint[]

/** What the model reads: a text line this many pixels high. */
export const LINE_HEIGHT = 48
// White space around the writing in the line, and the widest line given to the model.
const LINE_PADDING = 4
const MAX_LINE_WIDTH = 1280

export type InkBounds = { x: number; y: number; width: number; height: number }

export function inkBounds(strokes: InkStroke[]): InkBounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const stroke of strokes) for (const { x, y } of stroke) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  return x0 === Infinity ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Where the strokes go in the model's text line: scaled so that the writing fills the line's height, except that a flat
 * stroke (ㅡ, a dash) is not stretched to the full height; `minHeight` (in the pad's units) is the least height the
 * writing is taken to have. Returns the line's width and how a pad point maps into it.
 */
export function inkLayout(bounds: InkBounds, minHeight: number) {
  const inner = LINE_HEIGHT - 2 * LINE_PADDING
  const height = Math.max(bounds.height, minHeight, 1)
  const scale = Math.min(inner / height, (MAX_LINE_WIDTH - 2 * LINE_PADDING) / Math.max(bounds.width, 1))
  const width = Math.max(Math.ceil(bounds.width * scale) + 2 * LINE_PADDING, 2 * LINE_HEIGHT)
  // Centred vertically, so that a flat stroke sits in the middle of the line.
  const top = (LINE_HEIGHT - bounds.height * scale) / 2
  return {
    width,
    scale,
    map: ({ x, y }: InkPoint): InkPoint => ({ x: LINE_PADDING + (x - bounds.x) * scale, y: top + (y - bounds.y) * scale }),
  }
}

/** The line's RGBA pixels as the model's input: 3 × LINE_HEIGHT × width, each channel scaled to -1…1. */
export function lineTensor(rgba: ArrayLike<number>, width: number): Float32Array {
  const size = LINE_HEIGHT * width
  const data = new Float32Array(3 * size)
  for (let i = 0; i < size; i++) {
    // PaddleOCR's models take BGR.
    for (let c = 0; c < 3; c++) data[c * size + i] = rgba[i * 4 + 2 - c] / 127.5 - 1
  }
  return data
}

/**
 * The model's characters from its dictionary file, one per line: class 0 is CTC's blank and the last class is a space,
 * as PaddleOCR's recognisers are trained with `use_space_char`.
 */
export function recognitionClasses(dictionary: string): string[] {
  return ['', ...dictionary.split(/\r?\n/u).filter(line => line !== ''), ' ']
}

/** The model's output: per time step, a probability for every class (T × C, row by row). */
export type RecognitionOutput = { probabilities: ArrayLike<number>; steps: number; classes: number }

function logOf(p: number) {
  return Math.log(Math.max(p, 1e-12))
}

/** The most likely class at every step, with repeats and blanks dropped (greedy CTC), and that path's log-probability. */
export function readBestPath(output: RecognitionOutput, classes: string[]): { text: string; logProbability: number } {
  const { probabilities, steps, classes: count } = output
  let text = '', previous = -1, logProbability = 0
  for (let t = 0; t < steps; t++) {
    let best = 0, bestValue = -1
    for (let c = 0; c < count; c++) {
      const value = probabilities[t * count + c]
      if (value > bestValue) { bestValue = value; best = c }
    }
    logProbability += logOf(bestValue)
    if (best !== previous && best !== 0) text += classes[best] ?? ''
    previous = best
  }
  return { text: text.normalize('NFC'), logProbability }
}

function addLog(a: number, b: number) {
  if (a === -Infinity) return b
  if (b === -Infinity) return a
  return Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)))
}

/**
 * The log-probability that the model read exactly `text` (every CTC path to it, by the forward algorithm); -Infinity when
 * the text has a character the model does not know.
 */
export function textLogProbability(output: RecognitionOutput, classes: string[], text: string): number {
  const index = new Map(classes.map((character, i) => [character, i]))
  const labels: number[] = []
  for (const character of text.normalize('NFC')) {
    const label = index.get(character)
    if (label === undefined || label === 0) return -Infinity
    labels.push(label)
  }
  const { probabilities, steps, classes: count } = output
  // The labels with a blank before, between and after them.
  const extended = [0]
  for (const label of labels) extended.push(label, 0)
  const at = (t: number, c: number) => logOf(probabilities[t * count + c])
  let alpha = extended.map(() => -Infinity)
  alpha[0] = at(0, extended[0])
  if (extended.length > 1) alpha[1] = at(0, extended[1])
  for (let t = 1; t < steps; t++) {
    alpha = extended.map((label, s) => {
      let value = alpha[s]
      if (s > 0) value = addLog(value, alpha[s - 1])
      if (s > 1 && label !== 0 && label !== extended[s - 2]) value = addLog(value, alpha[s - 2])
      return value + at(t, label)
    })
  }
  const last = extended.length - 1
  return addLog(alpha[last], last > 0 ? alpha[last - 1] : -Infinity)
}

/**
 * How much less likely than the model's best reading the expected text may be and still count as written. Measured on
 * the official Korean handwriting words in three handwriting fonts: 3 accepts about 97% of the words written right and
 * about 0.7% of the words one letter (jamo) away, against 89% and 0% for the best reading alone.
 */
export const ACCEPT_MARGIN = 3

/**
 * What the writing reads as. `text` is the model's best reading, or `expected` when the model finds the expected text
 * nearly as likely (within ACCEPT_MARGIN), since the writer is copying a known word and the best reading of a word
 * written right can still be off by a letter.
 */
export function readHandwriting(output: RecognitionOutput, classes: string[], expected?: string): { text: string; accepted: boolean } {
  const best = readBestPath(output, classes)
  const text = best.text.trim()
  if (expected === undefined) return { text, accepted: false }
  const wanted = expected.normalize('NFC').trim()
  // Gaps between words are hard to judge in handwriting, so a reading with other spaces still counts.
  const spaceless = (value: string) => value.replace(/\s+/gu, '')
  if (spaceless(text) === spaceless(wanted)) return { text: wanted, accepted: true }
  const bestScore = Math.max(best.logProbability, textLogProbability(output, classes, best.text))
  const wantedScore = Math.max(textLogProbability(output, classes, wanted), textLogProbability(output, classes, spaceless(wanted)))
  const accepted = wantedScore >= bestScore - ACCEPT_MARGIN
  return { text: accepted ? wanted : text, accepted }
}
