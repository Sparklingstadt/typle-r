import type { SavedWordList } from '../../core/wordLists'
import samples from './samples.json'
import countries from './countries.json'
import commands from './commands.json'

/** The lists an account starts with. They are shown until the first save, which keeps them as the account's own lists. */
export const initialLists: SavedWordList[] = [...samples.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), ...countries, ...commands]
