import type { SavedWordList } from '../../core/wordLists'
import { normalizeLibrary, type Library } from '../../core/wordPacks'
import samples from './samples.json'
import countries from './countries.json'
import commands from './commands.json'

// Since v0.85.0 the lists are those of the sparklingstadt account, all in commands.json. samples.json and countries.json
// are empty but still read, as the Go backend and the apps read the same three files.
const sampleLists: Omit<SavedWordList, 'id' | 'records'>[] = samples

/** The lists of the official packs, before conversion to packs. */
export const initialLists: SavedWordList[] = [...sampleLists.map((list, index) => ({ ...list, id: `sample-${index + 1}`, records: [] })), ...countries, ...commands]

const converted = normalizeLibrary(initialLists, null)

/**
 * The same lists in the saved shape, with a pack for each group and for each list without one. Each pack is an
 * official pack (see catalog.ts): its catalog id is its own id, at version 1. Accounts follow these; they do not hold them.
 */
export const officialLibrary: Library = { ...converted, packs: converted.packs.map(pack => ({ ...pack, origin: { catalogId: pack.id, version: 1 } })) }

// A pack of initialLibrary is its official pack, followed: its id is made from the catalog id, and each list's from the
// pack's and the official list's, so that the app and Go (workspace.Initial) start every account with the same library.
const followedId = (catalogId: string) => `followed-${catalogId}`

/**
 * What a new account and the guest start with (since v0.100.0): every official pack, followed, in the catalog's order.
 * They are kept equal to the official packs as followed packs are, and can be unfollowed.
 */
export const initialLibrary: Library = {
  packs: officialLibrary.packs.map(pack => ({ ...pack, id: followedId(pack.id), origin: { ...pack.origin!, followed: true } })),
  lists: officialLibrary.packs.flatMap(pack => officialLibrary.lists.filter(list => list.packId === pack.id).map(list => ({
    ...list, id: `${followedId(pack.id)}:${list.id}`, packId: followedId(pack.id), records: [], origin: { listId: list.id },
  }))),
}
