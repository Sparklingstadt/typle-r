import type { SavedWordList } from '../../src/core/wordLists'
import { convertLibrary } from '../../src/core/wordPacks'

/**
 * A guest workspace as the app saves it (typle-r:guest-workspace:v1), from lists written as the tests write them:
 * without packs, a group making one pack of its lists and its category and tags the pack's (convertLibrary, as for the
 * catalog). The app no longer reads guest data without packs (v2.0.0).
 */
export function guestWorkspace(lists: unknown[], fields: Record<string, unknown> = {}) {
  return JSON.stringify({ version: 1, accountId: 'guest:local', revision: 1, devices: [], ...convertLibrary(lists as SavedWordList[]), ...fields })
}
