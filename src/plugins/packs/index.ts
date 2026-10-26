import type { SavedWordList } from '../../core/wordLists'
import { normalizeLibrary } from '../../core/wordPacks'
import samples from './samples.json'
import countries from './countries.json'
import commands from './commands.json'

// Since v0.85.0 the lists are those of the sparklingstadt account, all in commands.json. samples.json and countries.json
// are empty but still read, as the Go backend and the apps read the same three files.
const sampleLists: Omit<SavedWordList, 'id' | 'records'>[] = samples

/** The lists an account starts with. They are shown until the first save, which keeps them as the account's own lists. */
export const initialLists: SavedWordList[] = [...sampleLists.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), ...countries, ...commands]

/** The same lists in the saved shape, with a pack for each group and for each list without one. */
export const initialLibrary = normalizeLibrary(initialLists, null)
