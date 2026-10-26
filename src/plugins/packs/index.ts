import type { SavedWordList } from '../../core/wordLists'
import { normalizeLibrary, type Library } from '../../core/wordPacks'
import samples from './samples.json'
import countries from './countries.json'
import commands from './commands.json'

// Since v0.85.0 the lists are those of the sparklingstadt account, all in commands.json. samples.json and countries.json
// are empty but still read, as the Go backend and the apps read the same three files.
const sampleLists: Omit<SavedWordList, 'id' | 'records'>[] = samples

/** The lists an account starts with. They are shown until the first save, which keeps them as the account's own lists. */
export const initialLists: SavedWordList[] = [...sampleLists.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), ...countries, ...commands]

const converted = normalizeLibrary(initialLists, null)

/**
 * The same lists in the saved shape, with a pack for each group and for each list without one. Each pack is an
 * official pack (see catalog.ts): its catalog id is its own id, at version 1.
 */
export const initialLibrary: Library = { ...converted, packs: converted.packs.map(pack => ({ ...pack, origin: { catalogId: pack.id, version: 1 } })) }
