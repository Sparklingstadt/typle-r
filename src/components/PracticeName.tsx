"use client"
import { useTranslations } from "next-intl"
import { practiceName } from "@/core/packPractice"
import type { SavedWordList } from "@/core/wordLists"

const PACK = '\u0001'
const LIST = '\u0002'

type Named = Pick<SavedWordList, 'name' | 'group' | 'levels'>

/** A list's display name as text, for places that need a string (`aria-label`, `title`). */
export function usePracticeName(): (list: Named) => string {
  const t = useTranslations('common')
  return list => {
    const { pack, list: name } = practiceName(list)
    return pack === undefined ? name : t('packList', { pack, list: name })
  }
}

/** A list's display name; a list in a pack reads "pack › list" with the pack name in a muted colour. */
export default function PracticeName({ list }: { list: Named }) {
  const t = useTranslations('common')
  const { pack, list: name } = practiceName(list)
  if (pack === undefined) return <>{name}</>
  // Format with markers so the separator and word order stay in the message, then put the real names back as elements.
  const parts = t('packList', { pack: PACK, list: LIST }).split(new RegExp(`(${PACK}|${LIST})`))
  return <>{parts.map((part, index) => part === PACK ? <span key={index} className="font-normal text-muted-foreground">{pack}</span> : part === LIST ? name : part)}</>
}
