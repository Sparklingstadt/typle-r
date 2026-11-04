"use client"
import { useEffect, useRef } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Labels } from "@/core/listOverview"
import type { PackOverview } from "@/core/packEditing"
import type { PracticeMode } from "@/core/records"
import { SearchField } from "@/components/ui/search-field"
import CategorySelect from "@/components/Practice/CategorySelect"
import WordListOptions from "@/components/Practice/WordListOptions"

export default function ListChooserAside({ open, packs, labels, category, onCategoryChange, query, onQueryChange, selectedId, resetKey, mode, onSelect }: {
  open: boolean
  packs: PackOverview[]
  labels: Labels
  category: string | null
  onCategoryChange: (value: string | null) => void
  query: string
  onQueryChange: (value: string) => void
  selectedId: string
  resetKey: number
  mode: PracticeMode
  onSelect: (id: string) => void
}) {
  const t = useTranslations('practice')
  const asideLists = useRef<HTMLDivElement>(null)

  // Keeps the chosen list in view inside the scrolling list of lists, without scrolling the page.
  useEffect(() => {
    const box = asideLists.current
    const chosen = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!box || !chosen) return
    const top = chosen.offsetTop - box.offsetTop
    if (top < box.scrollTop || top + chosen.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - 8
  }, [selectedId])

  return <aside id="practice-aside" aria-label={t('aside.label')} className={cn("grid min-w-0 gap-6", !open && "lg:hidden")}>
    <Card className="gap-1 p-3">
      <div className="flex items-center gap-2 pl-2">
        <h2 className="text-[15px] font-bold">{t('aside.lists')}</h2>
        <span className="flex-1" />
        <Button variant="ghost" size="lg" asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('aside.create')}</Link></Button>
      </div>
      <SearchField value={query} onChange={onQueryChange} placeholder={t('picker.filter')} ariaLabel={t('aside.filter')} className="mx-1 mt-1 mb-1 h-9" />
      <div className="mx-1 mb-1"><CategorySelect labels={labels} value={category} onChange={onCategoryChange} /></div>
      {/* Its own scroll area, so a long collection never pushes the page far below the practice card. */}
      <div ref={asideLists} className="max-h-96 overflow-y-auto overscroll-contain lg:max-h-[min(36rem,calc(100dvh-14rem))]">
        {packs.length ? <WordListOptions label={t('aside.lists')} packs={packs} selectedId={selectedId} query={query} resetKey={resetKey} mode={mode}
          onSelect={onSelect} />
          : <p className="px-2 py-2 text-sm text-muted-foreground">{t('picker.noMatch')}</p>}
      </div>
    </Card>
  </aside>
}
