import { AppError } from './appError'
import { copyName, MAX_LISTS, MAX_LIST_NAME } from './listOverview'
import { levelPath, pathsOverlap, settle, tidyLevels } from './packEditing'
import { MAX_CATEGORY, MAX_LEVEL, MAX_LEVELS, MAX_TAG, MAX_TAGS, normalizeLabels, validateList, type SavedWordList } from './wordLists'
import { MAX_PACK_DESCRIPTION, MAX_PACK_NAME, nameKey, type Library, type WordPack } from './wordPacks'
import { fit, unique } from './workspaceDocument'

/**
 * A pack as a file (`<pack name>.typle-pack.json`), to hand to another account. It holds no records, ids, dates or
 * origin. The Go backend writes the same bytes (see tests/fixtures/pack-file/README.md).
 */
export type PackFile = {
  format: 'typle-pack'
  version: 1
  pack: { name: string; description?: string; category?: string; tags?: string[] }
  lists: { name: string; levels?: string[]; words: { display: string; input: string; annotation: string }[] }[]
}

/** The ids of a new pack and of its lists, one for each list in order. */
export type NewPackIds = { pack: string; lists: string[] }

const FORMAT = 'typle-pack'

const findPack = (library: Library, packId: string) => {
  const pack = library.packs.find(item => item.id === packId)
  if (!pack) throw new AppError('packDeleted')
  return pack
}

const wordsOf = (words: SavedWordList['words']) => words.map(({ display, input, annotation }) => ({ display, input, annotation }))

/** A pack of the library in the shape of a file. Empty optional fields are left out. */
export function packFileOf(library: Library, packId: string): PackFile {
  const { name, description, category, tags } = findPack(library, packId)
  return {
    format: FORMAT, version: 1,
    pack: { name, ...(description ? { description } : {}), ...(category ? { category } : {}), ...(tags?.length ? { tags: [...tags] } : {}) },
    lists: library.lists.filter(list => list.packId === packId)
      .map(list => ({ name: list.name, ...(list.levels?.length ? { levels: [...list.levels] } : {}), words: wordsOf(list.words) })),
  }
}

/** The file's text: keys in the order of PackFile, two-space indents and a newline at the end. */
export function encodePackFile(library: Library, packId: string): string {
  return JSON.stringify(packFileOf(library, packId), null, 2) + '\n'
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
// An optional field may be left out or null.
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || value === null || check(value)
const present = <K extends string, V>(key: K, value: V | null | undefined) => (value === undefined || value === null ? {} : { [key]: value }) as { [P in K]?: V }

/**
 * Reads a file's text. Only the shape is checked here; the rules of a save are checked when it is imported. Fields
 * Typle does not know are dropped. A file without lists is unreadable, as no pack can be empty.
 */
export function decodePackFile(text: string): PackFile {
  const unreadable = () => new AppError('packFileUnreadable')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw unreadable()
  }
  if (!isObject(data) || data.format !== FORMAT || data.version !== 1 || !isObject(data.pack) || !Array.isArray(data.lists) || !data.lists.length) {
    throw unreadable()
  }
  const { name, description, category, tags } = data.pack
  if (!isString(name) || !optional(description, isString) || !optional(category, isString) || !optional(tags, isStrings)) throw unreadable()
  const lists = data.lists.map((list: unknown) => {
    if (!isObject(list) || !isString(list.name) || !optional(list.levels, isStrings) || !Array.isArray(list.words)) throw unreadable()
    const words = list.words.map((word: unknown) => {
      if (!isObject(word) || !isString(word.display) || !isString(word.input) || !isString(word.annotation)) throw unreadable()
      return { display: word.display, input: word.input, annotation: word.annotation }
    })
    return { name: list.name, ...present('levels', list.levels as string[] | null | undefined), words }
  })
  return {
    format: FORMAT, version: 1,
    pack: { name, ...present('description', description as string | null), ...present('category', category as string | null), ...present('tags', tags as string[] | null) },
    lists,
  }
}

function checkRoom(library: Library, count: number) {
  if (library.lists.length + count > MAX_LISTS) throw new AppError('listLimit', { max: MAX_LISTS })
}

// The limits a save enforces on sizes (see validateLibrary and validateLists), checked on the file as it was read.
const MAX_WORDS = 1000
const MAX_INPUT = 1000
const MAX_DISPLAY = 1000
const MAX_ANNOTATION = 2000

function checkSizes(file: PackFile) {
  const { name, description, category, tags } = file.pack
  const labels = normalizeLabels({ category, tags })
  const tooLarge = name.length > MAX_PACK_NAME || (description?.trim().length ?? 0) > MAX_PACK_DESCRIPTION ||
    (labels.category?.length ?? 0) > MAX_CATEGORY || (labels.tags?.length ?? 0) > MAX_TAGS || !!labels.tags?.some(tag => tag.length > MAX_TAG) ||
    file.lists.some(item => {
      const levels = (item.levels ?? []).map(level => level.trim()).filter(Boolean)
      return item.name.length > MAX_LIST_NAME || item.words.length > MAX_WORDS || levels.length > MAX_LEVELS || levels.some(level => level.length > MAX_LEVEL) ||
        item.words.some(word => word.input.length > MAX_INPUT || word.display.length > MAX_DISPLAY || word.annotation.length > MAX_ANNOTATION)
    })
  if (tooLarge) throw new AppError('invalidPackFile')
}

function checkIds(ids: NewPackIds, count: number) {
  if (ids.lists.length !== count) throw new Error('One list id is needed for each list')
}

/**
 * The library with the file's pack added at the end, checked as createPack and saveListInPack check a save. The name
 * gets （2）, （3）… when a pack has it. Not settled: callers settle the result.
 */
export function addPackFile(library: Library, file: PackFile, ids: NewPackIds, now: Date, origin?: WordPack['origin']): Library {
  if (!file.lists.length) throw new AppError('packFileUnreadable')
  checkIds(ids, file.lists.length)
  const wanted = file.pack.name.trim()
  if (!wanted) throw new AppError('packNameRequired')
  checkRoom(library, file.lists.length)
  checkSizes(file)
  const createdAt = now.toISOString()
  const lists: SavedWordList[] = []
  file.lists.forEach((item, n) => {
    validateList({ name: item.name, words: item.words, records: [], createdAt }, lists)
    const list: SavedWordList = { id: ids.lists[n], name: item.name.trim(), ...tidyLevels(item.levels), packId: ids.pack, words: wordsOf(item.words), records: [], createdAt }
    if (lists.some(other => pathsOverlap(levelPath(other), levelPath(list)))) throw new AppError('levelsConflict')
    lists.push(list)
  })
  const names = new Set(library.packs.map(pack => nameKey(pack.name)))
  const description = file.pack.description?.trim()
  const pack: WordPack = {
    id: ids.pack, name: unique(names, wanted, count => fit(wanted, `（${count}）`)),
    ...(description ? { description } : {}), ...normalizeLabels(file.pack), ...(origin ? { origin } : {}), createdAt,
  }
  return { packs: [...library.packs, pack], lists: [...library.lists, ...lists] }
}

/** Adds the file's pack at the end, as a new pack without records. Nothing is added when a list breaks a rule. */
export function importPackFile(library: Library, file: PackFile, ids: NewPackIds, now = new Date()): Library {
  return settle(addPackFile(library, file, ids, now))
}

/**
 * Copies a pack and its lists, without records or origin, right after it. The copy is named as duplicateList names a
 * list: （コピー）, then （コピー2）…; its lists keep their names and come after every other list.
 */
export function copyPack(library: Library, packId: string, ids: NewPackIds, suffix: (n: number) => string, now = new Date()): Library {
  const source = findPack(library, packId)
  const mine = library.lists.filter(list => list.packId === packId)
  checkIds(ids, mine.length)
  checkRoom(library, mine.length)
  const createdAt = now.toISOString()
  const { description, category, tags } = source
  const pack: WordPack = {
    id: ids.pack, name: copyName(library.packs, source.name, suffix),
    ...(description ? { description } : {}), ...(category ? { category } : {}), ...(tags?.length ? { tags: [...tags] } : {}), createdAt,
  }
  const lists = mine.map((list, n): SavedWordList => ({
    id: ids.lists[n], name: list.name, ...(list.levels?.length ? { levels: [...list.levels] } : {}), packId: ids.pack,
    words: wordsOf(list.words), records: [], createdAt,
  }))
  const at = library.packs.indexOf(source) + 1
  return settle({ packs: [...library.packs.slice(0, at), pack, ...library.packs.slice(at)], lists: [...library.lists, ...lists] })
}
