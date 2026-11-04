export type TypingSession = {
  index: number
  input: string
  startedAt: number | null
  finishedAt: number | null
  attempts: number
  mistakes: number
  // When the input lost focus mid-practice; the clock stands still until it is resumed.
  pausedAt?: number | null
  // The last key did not match the next character; it stays marked until the right character is typed.
  missed?: boolean
  // The first s of the two-key alternative for ß has been accepted; input stays at the target position.
  pendingSharpS?: boolean
  // Accepted Latin keys for the current Cyrillic letter; only complete letters enter input.
  pendingCyrillic?: string
  // The answer of the current word was revealed (recall mode); cleared when the next word starts.
  revealed?: boolean
}

export function newSession(): TypingSession {
  return { index: 0, input: "", startedAt: null, finishedAt: null, attempts: 0, mistakes: 0, pausedAt: null, missed: false, revealed: false }
}

// Stops the clock of a running session. Before the first character or after the last there is nothing to stop.
export function pauseSession(session: TypingSession, now: number): TypingSession {
  if (session.startedAt === null || session.finishedAt !== null || session.pausedAt != null) return session
  return { ...session, pausedAt: now }
}

// Moves startedAt on by the length of the pause, so elapsed time, speed and the recorded time all leave it out.
export function resumeSession(session: TypingSession, now: number): TypingSession {
  if (session.pausedAt == null || session.startedAt === null) return session
  return { ...session, startedAt: session.startedAt + Math.max(0, now - session.pausedAt), pausedAt: null }
}

// Milliseconds of typing so far: up to the finish, or to the pause while paused.
export function elapsedTime(session: TypingSession, now: number) {
  if (session.startedAt === null) return 0
  return Math.max(0, (session.finishedAt ?? session.pausedAt ?? now) - session.startedAt)
}

export type TypingOptions = {
  // Simple input: plain Latin letters for accents and Cyrillic, ss for ß, and ? for ¿.
  ignoreAccents?: boolean
  // Upper and lower case count as the same letter (a for A, É for é).
  ignoreCase?: boolean
}

// A Latin letter with its accents and other marks taken off, or null for anything else. Only Latin letters are folded:
// kana such as が also split into a base and a mark, and か must not count for it.
export function latinBase(char: string) {
  const base = char.normalize('NFD').replace(/\p{M}/gu, '')
  return /^\p{Script=Latin}$/u.test(base) ? base : null
}

export const cyrillicLatin: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '"', ы: 'y', ь: "'", э: 'e', ю: 'yu', я: 'ya',
}

export function cyrillicAlternatives(target: string): string[] {
  const lower = target.toLowerCase()
  const latin = cyrillicLatin[lower]
  if (!latin) return []
  // Capital letters accept title case (Sh) and all caps (SH).
  return target === lower ? [latin] : [latin[0].toUpperCase() + latin.slice(1), latin.toUpperCase()]
}

// The characters of `text` that simple input lets you type with other keys, each once and in order, with the key to press:
// [['é', 'e'], ['ш', 'sh']]. Capitals show their title case (Ш → Sh).
export function simpleInputKeys(text: string): [string, string][] {
  const keys = new Map<string, string>()
  for (const char of Array.from(text)) {
    if (keys.has(char)) continue
    const key = char === 'ß' ? 'ss' : char === '¿' ? '?' : cyrillicAlternatives(char)[0] ?? latinBase(char)
    if (key && key !== char) keys.set(char, key)
  }
  return [...keys]
}

export function matchesCharacter(typed: string, target: string, options: TypingOptions = {}) {
  if (options.ignoreCase) {
    typed = typed.toLowerCase()
    target = target.toLowerCase()
  }
  if (typed === target) return true
  if (!options.ignoreAccents) return false
  if (target === '¿' && typed === '?') return true
  if (cyrillicAlternatives(target).includes(typed)) return true
  return latinBase(target) === typed
}

// `value` is the typed text so far; only what was added since the last call counts as new keys. A key that matches the
// next character moves on, any other key is a mistake and leaves the position where it was, so `input` only ever holds
// correct characters. Removing characters does nothing: there is no wrong input to take back. A key matched without its
// accent adds the character it stands for, so `input` still reads as the word.
export function typeInput(current: TypingSession, words: { input: string }[], value: string, now: number, options: TypingOptions = {}): TypingSession {
  if (current.finishedAt !== null || !words[current.index]) return current
  const previous = Array.from(current.input)
  const next = Array.from(value)
  let common = 0
  while (common < previous.length && common < next.length && previous[common] === next[common]) common++
  const inserted = next.slice(common)
  if (!inserted.length) return current
  // Typing always runs the clock, even if the input was not focused through the usual event.
  const resumed = resumeSession(current, now)
  let session: TypingSession = { ...resumed, startedAt: resumed.startedAt ?? now }
  for (const char of inserted) {
    if (session.finishedAt !== null) break
    const target = words[session.index].input
    const expected = Array.from(target)[Array.from(session.input).length]
    let cyrillicKey = false
    if (expected !== undefined && options.ignoreAccents && !matchesCharacter(char, expected, options)) {
      const candidate = (session.pendingCyrillic ?? '') + (options.ignoreCase ? char.toLowerCase() : char)
      const alternatives = cyrillicAlternatives(options.ignoreCase ? expected.toLowerCase() : expected)
      cyrillicKey = alternatives.includes(candidate)
      if (!cyrillicKey && alternatives.some(value => value.startsWith(candidate))) {
        session = { ...session, pendingCyrillic: candidate, attempts: session.attempts + 1, missed: false }
        continue
      }
    }
    const sharpSKey = options.ignoreAccents && (expected === 'ß' || expected === 'ẞ')
      && matchesCharacter(char, expected === 'ß' ? 's' : 'S', options)
    if (sharpSKey && !session.pendingSharpS) {
      session = { ...session, pendingSharpS: true, attempts: session.attempts + 1, missed: false }
      continue
    }
    if (expected === undefined || (!cyrillicKey && !sharpSKey && !matchesCharacter(char, expected, options))) {
      session = { ...session, attempts: session.attempts + 1, mistakes: session.mistakes + 1, missed: true }
      continue
    }
    const input = session.input + expected
    session = { ...session, input, attempts: session.attempts + 1, missed: false, pendingSharpS: false, pendingCyrillic: '' }
    if (input !== target) continue
    session = session.index === words.length - 1 ? { ...session, finishedAt: now } : { ...session, index: session.index + 1, input: "", revealed: false }
  }
  return session
}

// Reveals the answer of the current word: the untyped characters count as attempts and mistakes, once per word.
// Judging is unchanged; the whole word must still be typed.
export function revealAnswer(session: TypingSession, words: { input: string }[], now: number): TypingSession {
  const word = words[session.index]
  if (session.finishedAt !== null || !word || session.revealed) return session
  const remaining = Math.max(0, Array.from(word.input).length - Array.from(session.input).length)
  const resumed = resumeSession(session, now)
  return {
    ...resumed,
    startedAt: resumed.startedAt ?? now,
    attempts: resumed.attempts + remaining,
    mistakes: resumed.mistakes + remaining,
    revealed: true,
  }
}

export function sessionResult(session: TypingSession) {
  return {
    time: Math.max(0, ((session.finishedAt ?? 0) - (session.startedAt ?? 0)) / 1000),
    mistakes: session.mistakes,
    accuracy: session.attempts ? Math.round((session.attempts - session.mistakes) / session.attempts * 10000) / 100 : 100,
  }
}

export type CharacterState = 'done' | 'current' | 'error' | 'current-error' | 'pending'

// Compare only committed input with the characters to type. Everything from the first mismatch on is an error,
// so a later character that happens to match is not shown as correct. `missed` marks the next character as mistyped.
export function compareInput(target: string, typed: string, missed = false) {
  const characters = Array.from(target)
  const actual = Array.from(typed)
  let errorIndex = actual.findIndex((char, index) => index < characters.length && char !== characters[index])
  if (errorIndex === -1 && actual.length > characters.length) errorIndex = characters.length
  if (errorIndex === -1 && missed) errorIndex = actual.length
  const states = characters.map((_, index): CharacterState => {
    if (index < actual.length) return errorIndex === -1 || index < errorIndex ? 'done' : 'error'
    if (index === actual.length) return errorIndex === -1 ? 'current' : 'current-error'
    return 'pending'
  })
  return { characters, states, extra: actual.slice(characters.length), errorIndex }
}

export type InputComparison = ReturnType<typeof compareInput>

// Characters to draw for a hidden answer: typed characters are shown, untyped ones become a placeholder (spaces stay).
export function concealCharacters(characters: string[], states: CharacterState[]): string[] {
  return characters.map((char, index) => {
    const state = states[index]
    if (state === 'done' || state === 'error' || /^\s$/u.test(char)) return char
    return '＿'
  })
}

// Correctly typed characters per minute (committed characters for IME input); null until a second has passed.
export function typingSpeed(session: TypingSession, now: number) {
  if (session.startedAt === null) return null
  const elapsed = elapsedTime(session, now)
  return elapsed < 1000 ? null : Math.round((session.attempts - session.mistakes) / (elapsed / 60000))
}
