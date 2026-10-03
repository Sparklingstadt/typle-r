import type { SavedWordList } from './wordLists'

export async function prepareLegacy(lists: SavedWordList[]): Promise<SavedWordList[]> {
  return Promise.all(lists.map(async list => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(list)))
    const hash = Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('')
    return { ...list, id: `legacy-${hash}` }
  }))
}

// `suffix(n)` is the localized mark for a renamed list, such as （移行 2）.
export function mergeLegacy(current: SavedWordList[], incoming: SavedWordList[], suffix: (n: number) => string) {
  const merged = [...current]
  for (const list of incoming) {
    if (merged.some(item => item.id === list.id)) continue
    let name = list.name
    let n = 2
    while (merged.some(item => item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) {
      name = `${list.name.slice(0, 180)}${suffix(n++)}`
    }
    merged.push({ ...list, name })
  }
  return merged
}
