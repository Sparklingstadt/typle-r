"use client"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { rankingQuery } from "@/core/rankings"
import type { PracticeMode } from "@/core/records"
import type { SavedWordList } from "@/core/wordLists"
import PracticeBestRecords from "@/components/Practice/PracticeBestRecords"
import PracticeName from "@/components/PracticeName"

export default function BestRecordsCard({ list, mode, records, showsCountNote, wordCount, highlightId }: {
  list: SavedWordList
  mode: PracticeMode
  records: SavedWordList['records']
  showsCountNote: boolean
  wordCount: number
  highlightId?: string
}) {
  const t = useTranslations('practice')
  return <Card className="gap-2 px-4 pt-4 pb-3">
    <div className="flex min-w-0 items-baseline gap-2">
      <h2 className="shrink-0 text-[15px] font-bold">{t('aside.best')}</h2>
      <span className="truncate text-xs text-muted-foreground"><PracticeName list={list} /></span>
    </div>
    <p className="text-xs text-muted-foreground">{showsCountNote ? t('aside.bestOrderAtCount', { count: wordCount }) : t('aside.bestOrder')}</p>
    <PracticeBestRecords records={records} highlightId={highlightId} />
    <Link href={`/rankings?${rankingQuery({ list: list.id, device: null, order: 'accuracy', mode })}`} className="inline-flex w-fit items-center gap-1 rounded-sm px-2 pt-1 text-[13px] font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{t('aside.allBest')}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
  </Card>
}
