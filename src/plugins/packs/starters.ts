import { officialPacks, type OfficialPack } from './catalog'

/**
 * The official packs /play offers to someone with no pack yet, in this order: a language pack and a programming pack
 * for beginners, and one for learners of Chinese, the language most official packs are for.
 */
export const STARTER_CATALOG_IDS: readonly string[] = [
  'pack-english-basic-words',
  'pack-0b27f311-38aa-40aa-9c29-ea17e374e1fe',
  'pack-chinese-hsk5-words-1',
]

export function starterPacks(): OfficialPack[] {
  return STARTER_CATALOG_IDS.flatMap(catalogId => officialPacks().filter(entry => entry.catalogId === catalogId))
}
