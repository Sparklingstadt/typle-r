// A practice result someone chose to share on X: carried in the query of /result, which shows it and sets an image
// of it as the page's social card. Nothing is stored; the link holds the whole result, so every value is checked.

export const SHARED_RESULT_MODES = ['normal', 'recall', 'writing'] as const
export type SharedResultMode = (typeof SHARED_RESULT_MODES)[number]

export type SharedResult = {
  name: string
  time: number
  accuracy: number
  speed: number | null
  words: number
  mode: SharedResultMode
}

export const MAX_SHARED_NAME = 60
const MAX_TIME = 36000
const MAX_SPEED = 5000
const MAX_WORDS = 10000

type Query = Record<string, string | string[] | undefined> | URLSearchParams

function read(query: Query, key: string): string | undefined {
  const value = query instanceof URLSearchParams ? query.get(key) ?? undefined : query[key]
  return Array.isArray(value) ? value[0] : value
}

function number(value: string | undefined, max: number, integer: boolean): number | null {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed > max || (integer && !Number.isInteger(parsed))) return null
  return parsed
}

// The list name as shared: one line, trimmed and cut to MAX_SHARED_NAME characters (not UTF-16 units).
export function sharedName(name: string): string {
  const line = name.replace(/\s+/g, ' ').trim()
  return Array.from(line).slice(0, MAX_SHARED_NAME).join('')
}

export function toSharedQuery(result: SharedResult): string {
  const query = new URLSearchParams({
    n: sharedName(result.name),
    t: result.time.toFixed(2),
    a: String(Math.round(result.accuracy)),
    w: String(result.words),
  })
  if (result.speed !== null) query.set('s', String(Math.round(result.speed)))
  if (result.mode !== 'normal') query.set('m', result.mode)
  return query.toString()
}

// The result a link carries, or null when anything in it is missing or out of range.
export function fromSharedQuery(query: Query): SharedResult | null {
  const name = sharedName(read(query, 'n') ?? '')
  const time = number(read(query, 't'), MAX_TIME, false)
  const accuracy = number(read(query, 'a'), 100, true)
  const words = number(read(query, 'w'), MAX_WORDS, true)
  const speedText = read(query, 's')
  const speed = speedText === undefined ? null : number(speedText, MAX_SPEED, true)
  const modeText = read(query, 'm') ?? 'normal'
  const mode = SHARED_RESULT_MODES.find(item => item === modeText)
  if (!name || time === null || time <= 0 || accuracy === null || words === null || words < 1 || !mode) return null
  if (speedText !== undefined && speed === null) return null
  return { name, time: Math.round(time * 100) / 100, accuracy, speed, words, mode }
}

// The X (Twitter) web intent that opens a post with the text and the link filled in; the person can still edit it.
export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`
}
