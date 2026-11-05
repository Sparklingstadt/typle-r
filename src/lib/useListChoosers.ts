import { useMemo, useState } from 'react'
import { useLocale } from 'next-intl'
import { listLabels } from '@/core/listOverview'
import { packOverviews } from '@/core/packEditing'
import { packsByRecentPractice } from '@/core/packPractice'
import { matchingPacks } from '@/core/practiceView'
import type { SavedWordList } from '@/core/wordLists'
import type { WordPack } from '@/core/wordPacks'

// The state of the two list choosers of a screen: the side panel and the dialog.
// Each has its own search. They share one category, so the lists of a subject stay in view while switching between them.
// Recently practised packs come first, narrowed down by category and by what the pack, its lists and its words say.
export function useListChoosers(packs: WordPack[], lists: SavedWordList[]) {
  const locale = useLocale()
  const [asideQuery, setAsideQuery] = useState('')
  const [pickerQuery, setPickerQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const overviews = useMemo(() => packsByRecentPractice(packOverviews({ packs, lists })), [packs, lists])
  const labels = useMemo(() => listLabels(packs, locale), [packs, locale])
  const asidePacks = useMemo(() => matchingPacks(overviews, category, asideQuery), [overviews, category, asideQuery])
  const pickerPacks = useMemo(() => matchingPacks(overviews, category, pickerQuery), [overviews, category, pickerQuery])
  return { labels, category, setCategory, asideQuery, setAsideQuery, asidePacks, pickerQuery, setPickerQuery, pickerPacks }
}
