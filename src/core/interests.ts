import { AppError } from './appError'
import { nameKey, type WordPack } from './wordPacks'

export type InterestOption = { id: string; category: string; children: { id: string; tag: string }[] }

const child = (parent: string, name: string, tag: string) => ({ id: `${parent}/${name}`, tag })

/** The interests a user can pick, in the order they are shown and saved. The tags are those official packs carry. */
export const INTEREST_OPTIONS: InterestOption[] = [
  {
    id: 'language', category: '語学', // i18n-ignore
    children: [
      child('language', 'zh', '中国語'), child('language', 'ru', 'ロシア語'), child('language', 'ko', '韓国語'), // i18n-ignore
      child('language', 'en', '英語'), child('language', 'es', 'スペイン語'), child('language', 'fr', 'フランス語'), // i18n-ignore
      child('language', 'de', 'ドイツ語'), // i18n-ignore
    ],
  },
  {
    id: 'programming', category: 'プログラミング', // i18n-ignore
    children: [
      child('programming', 'go', 'Go'), child('programming', 'kotlin', 'Kotlin'), child('programming', 'java', 'Java'),
      child('programming', 'typescript', 'TypeScript'), child('programming', 'php', 'PHP'), child('programming', 'ruby', 'Ruby'),
      child('programming', 'sql', 'SQL'), child('programming', 'linux', 'Linux'), child('programming', 'vim', 'Vim'),
      child('programming', 'test', 'テスト'), // i18n-ignore
    ],
  },
]

export const MAX_INTERESTS = 50
export const MAX_INTEREST_LENGTH = 50

const known = INTEREST_OPTIONS.flatMap(option => [option.id, ...option.children.map(item => item.id)])
const knownIds = new Set(known)

/** Reads saved interests: absent is empty; anything but a list of distinct, non-empty, short strings is corrupted. */
export function decodeInterests(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_INTERESTS ||
      value.some(id => typeof id !== 'string' || !id || id.length > MAX_INTEREST_LENGTH) || new Set(value).size !== value.length) {
    throw new AppError('savedDataCorrupted')
  }
  return [...value]
}

/** Known ids in the order of the options, then unknown ids in their own order; each once. */
export function normalizeInterests(interests: string[]): string[] {
  const chosen = new Set(interests)
  return [...known.filter(id => chosen.has(id)), ...[...chosen].filter(id => !knownIds.has(id))]
}

/** Picks or drops an interest. Dropping a parent drops its children; a child can be picked only under a picked parent. */
export function toggleInterest(interests: string[], id: string): string[] {
  const parent = INTEREST_OPTIONS.find(option => option.id === id)
  if (parent) {
    if (!interests.includes(id)) return normalizeInterests([...interests, id])
    const children = new Set(parent.children.map(item => item.id))
    return normalizeInterests(interests.filter(item => item !== id && !children.has(item)))
  }
  const owner = INTEREST_OPTIONS.find(option => option.children.some(item => item.id === id))
  if (owner && !interests.includes(owner.id)) return normalizeInterests(interests)
  return normalizeInterests(interests.includes(id) ? interests.filter(item => item !== id) : [...interests, id])
}

/** Whether a pack fits the interests. Empty interests fit no pack. */
export function matchesInterests(pack: Pick<WordPack, 'category' | 'tags'>, interests: string[]): boolean {
  const category = nameKey(pack.category ?? '')
  const tags = new Set((pack.tags ?? []).map(nameKey))
  return INTEREST_OPTIONS.some(option => {
    if (!interests.includes(option.id) || nameKey(option.category) !== category) return false
    const chosen = option.children.filter(item => interests.includes(item.id))
    return !chosen.length || chosen.some(item => tags.has(nameKey(item.tag)))
  })
}
