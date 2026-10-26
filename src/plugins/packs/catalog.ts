import type { NewPackIds } from '../../core/packFile'
import { followPack, isFollowed, type OfficialPack } from '../../core/followedPacks'
import type { Library } from '../../core/wordPacks'
import { officialLibrary } from '.'

// The official packs are the packs an account can follow (src/core may not read plugins, so the catalog lives here).
export type { OfficialPack }
/** `followed` when the library has a followed pack from this entry. */
export type CatalogEntry = OfficialPack & { followed: boolean }

// Built once: guest reads and writes follow the catalog every time. Callers only read it.
const official: OfficialPack[] = officialLibrary.packs.map(pack => ({
  catalogId: pack.origin!.catalogId, version: pack.origin!.version, pack,
  lists: officialLibrary.lists.filter(list => list.packId === pack.id),
}))

export function officialPacks(): OfficialPack[] {
  return official
}

export function catalogEntries(library: Library): CatalogEntry[] {
  return officialPacks().map(entry => ({
    ...entry, followed: library.packs.some(pack => isFollowed(pack) && pack.origin?.catalogId === entry.catalogId),
  }))
}

/** Follows an official pack: it is added at the end, kept equal to the official one, without records. The name gets （2）… when taken. */
export function followOfficialPack(library: Library, catalogId: string, ids: NewPackIds, now = new Date()): Library {
  return followPack(library, officialPacks(), catalogId, ids, now)
}
