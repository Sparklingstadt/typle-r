// Recall mode shows a word's annotation without giving away the answer.
// Returns "" when nothing useful remains so the screen can fall back to other hints.

const BLANK = '＿＿'
const SEPARATOR = ' / '
const MIN_CANDIDATE_LENGTH = 2

type Normalized = { text: string; origin: number[] }

function fold(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function normalize(value: string): string {
  return Array.from(value, fold).join('')
}

// Normalized text plus, for each normalized UTF-16 unit, the index of its source character in the original.
function normalizeWithOrigin(value: string): Normalized {
  let text = ''
  const origin: number[] = []
  let index = 0
  for (const char of value) {
    const folded = fold(char)
    text += folded
    for (let i = 0; i < folded.length; i++) origin.push(index)
    index += char.length
  }
  return { text, origin }
}

function candidatesOf(word: { display: string; input: string }): string[] {
  const first = word.input.trim().split(/\s+/)[0] ?? ''
  const found = [word.input, word.display, first]
    .map(normalize)
    .map((c) => c.trim())
    .filter((c) => Array.from(c).length >= MIN_CANDIDATE_LENGTH)
  return Array.from(new Set(found)).sort((a, b) => b.length - a.length)
}

function replaceCandidate(source: string, candidate: string): string {
  const { text, origin } = normalizeWithOrigin(source)
  const ranges: Array<[number, number]> = []
  let from = 0
  for (;;) {
    const at = text.indexOf(candidate, from)
    if (at < 0) break
    const last = at + candidate.length - 1
    const start = origin[at]
    const lastStart = origin[last]
    const lastChar = String.fromCodePoint(source.codePointAt(lastStart) as number)
    ranges.push([start, lastStart + lastChar.length])
    from = at + candidate.length
  }
  let result = source
  for (const [start, end] of ranges.reverse()) {
    result = result.slice(0, start) + BLANK + result.slice(end)
  }
  return result
}

// The display text of a word as a recall hint: only when it differs from the typed text by more than whitespace
// (java - version vs java -version would give the answer away), and never for code.
export function recallDisplayHint(word: { display: string; input: string; input_type?: string }): string {
  if (word.input_type === 'code') return ''
  const bare = (value: string) => value.replace(/\s+/g, '')
  return bare(word.display) === bare(word.input) ? '' : word.display
}

export function recallPrompt(word: { display: string; input: string; annotation: string }): string {
  const candidates = candidatesOf(word)
  if (candidates.length === 0) return isEmpty(word.annotation) ? '' : word.annotation
  let result: string
  if (word.annotation.includes(SEPARATOR)) {
    result = word.annotation
      .split(SEPARATOR)
      .filter((part) => {
        const n = normalize(part)
        return !candidates.some((c) => n.includes(c))
      })
      .join(SEPARATOR)
  } else {
    result = word.annotation
    for (const candidate of candidates) result = replaceCandidate(result, candidate)
  }
  return isEmpty(result) ? '' : result
}

function isEmpty(value: string): boolean {
  return /^[\p{P}\p{S}\s＿]*$/u.test(value)
}
