import { cyrillicAlternatives, matchesCharacter, noteMistake, resumeSession, type TypingOptions, type TypingSession } from './typing'
import type { WritingLanguage } from './wordLists'

const SPACELESS: readonly WritingLanguage[] = ['ja', 'zh-Hans', 'zh-Hant']

// NFC, trimmed, runs of white space as one space; none at all for languages that are written without spaces.
export function normalizeWriting(text: string, language: WritingLanguage): string {
  const composed = text.normalize('NFC')
  return SPACELESS.includes(language) ? composed.replace(/\s+/gu, '') : composed.replace(/\s+/gu, ' ').trim()
}

// Reads the candidate from the front, one target character at a time; the whole candidate has to be used.
function matchesOne(candidate: string[], target: string[], options: TypingOptions): boolean {
  let p = 0
  const fold = (value: string) => options.ignoreCase ? value.toLowerCase() : value
  for (const t of target) {
    const here = candidate[p]
    if (here !== undefined && matchesCharacter(here, t, options)) {
      p += 1
      continue
    }
    if (!options.ignoreAccents) return false
    if (t === 'ß' || t === 'ẞ') {
      if (fold(candidate.slice(p, p + 2).join('')) !== fold(t === 'ß' ? 'ss' : 'SS')) return false
      p += 2
      continue
    }
    const alternative = cyrillicAlternatives(options.ignoreCase ? t.toLowerCase() : t)
      .find(value => fold(candidate.slice(p, p + Array.from(value).length).join('')) === fold(value))
    if (alternative === undefined) return false
    p += Array.from(alternative).length
  }
  return p === candidate.length
}

export function matchesWriting(candidates: string[], target: string, language: WritingLanguage, options: TypingOptions = {}): boolean {
  const expected = Array.from(normalizeWriting(target, language))
  return candidates.some(candidate => matchesOne(Array.from(normalizeWriting(candidate, language)), expected, options))
}

// Runs the clock: starts it on the first call and carries on after a pause.
export function startWriting(session: TypingSession, now: number): TypingSession {
  if (session.finishedAt !== null) return session
  const resumed = resumeSession(session, now)
  return resumed.startedAt === null ? { ...resumed, startedAt: now } : resumed
}

function advance(session: TypingSession, words: { display: string }[], now: number): TypingSession {
  return session.index >= words.length - 1
    ? { ...session, finishedAt: now }
    : { ...session, index: session.index + 1, input: '' }
}

// A match moves on. A mismatch counts only when the writer asked for it (explicit, e.g. Enter) and wrote something;
// a silent recognition result that does not match yet changes nothing.
export function judgeWriting(
  session: TypingSession,
  words: { display: string }[],
  candidates: string[],
  now: number,
  language: WritingLanguage,
  options: TypingOptions,
  explicit: boolean,
): TypingSession {
  const word = words[session.index]
  if (session.finishedAt !== null || !word) return session
  if (matchesWriting(candidates, word.display, language, options)) {
    const started = startWriting(session, now)
    return advance({ ...started, attempts: started.attempts + 1, missed: false }, words, now)
  }
  if (!explicit || !candidates.some(candidate => normalizeWriting(candidate, language) !== '')) return session
  const started = startWriting(session, now)
  const typed = candidates.find(candidate => normalizeWriting(candidate, language) !== '') ?? ''
  return { ...started, attempts: started.attempts + 1, mistakes: started.mistakes + 1, missed: true, wordMistakes: noteMistake(started, { wrong: { typed } }) }
}

export function skipWord(session: TypingSession, words: { display: string }[], now: number): TypingSession {
  if (session.finishedAt !== null || !words[session.index]) return session
  const started = startWriting(session, now)
  return advance({ ...started, attempts: started.attempts + 1, mistakes: started.mistakes + 1, missed: false, wordMistakes: noteMistake(started, { skipped: true }) }, words, now)
}
