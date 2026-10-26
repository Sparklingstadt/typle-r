import type { ListRanking, ListSort } from './rankings'
import type { SavedWordList } from './wordLists'
import type { WordPack } from './wordPacks'

export type PackRanking = {
  pack: WordPack
  /** The rankings of the lists in the pack, in saved order. */
  items: ListRanking[]
  practiceCount: number
  /** Lists with at least one record. */
  practicedListCount: number
  lastPracticed: Date | null
  /** Lists whose best set is recent (`improved`). */
  improvedCount: number
}

/** `rankings` has one entry per list, already limited to the chosen device. Packs keep their saved order; packs without lists are left out. */
export function packRankings(packs: WordPack[], rankings: ListRanking[]): PackRanking[] {
  return packs.flatMap(pack => {
    const items = rankings.filter(item => item.list.packId === pack.id)
    if (!items.length) return []
    const last = items.reduce((latest, item) => Math.max(latest, item.lastPracticed?.getTime() ?? 0), 0)
    return [{
      pack, items,
      practiceCount: items.reduce((total, item) => total + item.records.length, 0),
      practicedListCount: items.filter(item => item.records.length > 0).length,
      lastPracticed: last ? new Date(last) : null,
      improvedCount: items.filter(item => item.improved).length,
    }]
  })
}

/** recent: latest practice first (never practised last); name: pack name; count: most runs first, then recent. Ties keep the saved order. */
export function sortPackRankings(items: PackRanking[], sort: ListSort, locale = 'ja') {
  const recent = (a: PackRanking, b: PackRanking) => (b.lastPracticed?.getTime() ?? 0) - (a.lastPracticed?.getTime() ?? 0)
  return [...items].sort(sort === 'name' ? (a, b) => a.pack.name.localeCompare(b.pack.name, locale)
    : sort === 'count' ? (a, b) => b.practiceCount - a.practiceCount || recent(a, b)
      : recent)
}

/** Matches the pack name or a list name, ignoring case. Returns the ids of the lists that match; a pack name matches every list. */
export function matchesRankingQuery(item: PackRanking, query: string): string[] {
  const needle = query.trim().toLocaleLowerCase()
  const has = (name: string) => name.toLocaleLowerCase().includes(needle)
  if (has(item.pack.name)) return item.items.map(ranking => ranking.list.id)
  return item.items.filter(ranking => has(ranking.list.name)).map(ranking => ranking.list.id)
}

/** The choices of the pack filter on the records screen: packs with records only, in saved order, counting their records. */
export function packRecordOptions(packs: WordPack[], lists: SavedWordList[]) {
  return packs.flatMap(pack => {
    const count = lists.filter(list => list.packId === pack.id).reduce((total, list) => total + list.records.length, 0)
    return count ? [{ value: pack.id, label: pack.name, count }] : []
  })
}
