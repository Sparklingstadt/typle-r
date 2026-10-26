import { levelName } from './listOverview'
import type { PackOverview } from './packEditing'
import type { SavedWordList } from './wordLists'

/** Packs by most recent practice (newest `lastPracticed` first). Packs never practiced come last, in saved order. */
export function packsByRecentPractice(items: PackOverview[]): PackOverview[] {
  return [...items].sort((a, b) => {
    if (a.lastPracticed === b.lastPracticed) return a.position - b.position
    if (a.lastPracticed === null) return 1
    if (b.lastPracticed === null) return -1
    return b.lastPracticed - a.lastPracticed
  })
}

/** What a pack offers to practice: lists with levels first, then lists without, each in saved order. */
export function packChoices(item: PackOverview): SavedWordList[] {
  const lists = item.lists.map(overview => overview.list)
  const hasLevels = (list: SavedWordList) => !!list.levels?.length
  return [...lists.filter(hasLevels), ...lists.filter(list => !hasLevels(list))]
}

/** The parts of a list's display name. A list in a group has `pack` and its level name; others have only their name.
 * Screens join them with the `common.packList` text ({pack} › {list}). */
export function practiceName(list: Pick<SavedWordList, 'name' | 'group' | 'levels'>): { pack?: string; list: string } {
  return list.group ? { pack: list.group, list: levelName(list) } : { list: list.name }
}
