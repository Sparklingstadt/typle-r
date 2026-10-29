import type { SavedWordList } from '../../core/wordLists'
import { convertLibrary, type Library } from '../../core/wordPacks'
import samples from './samples.json'
import countries from './countries.json'
import commands from './commands'

// The official lists live in commands/, one JSON file per list. samples.json and countries.json
// remain empty; the Go backend reads the same data and order (commands/manifest.json).
const sampleLists: Omit<SavedWordList, 'id' | 'records'>[] = samples

/** The lists of the official packs, before conversion to packs. */
export const initialLists: SavedWordList[] = [...sampleLists.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), ...countries, ...commands]

const converted = convertLibrary(initialLists)

/**
 * The same lists in the saved shape, with a pack for each group and for each list without one. Each pack is an
 * official pack (see catalog.ts): its catalog id is its own id, at version 1. Accounts follow these; they do not hold them.
 */
export const officialLibrary: Library = { ...converted, packs: converted.packs.map(pack => ({ ...pack, origin: { catalogId: pack.id, version: 1 } })) }

/** What a new account and the guest start with: nothing. Official packs are followed from the catalog. */
export const initialLibrary: Library = { packs: [], lists: [] }
