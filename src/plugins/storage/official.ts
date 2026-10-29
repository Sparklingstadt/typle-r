import { followOfficial } from '../../core/followedPacks'
import type { Library } from '../../core/wordPacks'
import { officialPacks } from '../packs/catalog'

/** The library as the screens show it: followed packs in line with the catalog, with the words they are saved without. */
export function followed<T extends Library>(state: T): T {
  return { ...state, ...followOfficial({ lists: state.lists, packs: state.packs }, officialPacks()) }
}
