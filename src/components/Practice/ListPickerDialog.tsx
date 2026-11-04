"use client"
import { useTranslations } from "next-intl"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Labels } from "@/core/listOverview"
import type { PackOverview } from "@/core/packEditing"
import type { PracticeMode } from "@/core/records"
import { SearchField } from "@/components/ui/search-field"
import CategorySelect from "@/components/Practice/CategorySelect"
import WordListOptions from "@/components/Practice/WordListOptions"

export default function ListPickerDialog({ open, onOpenChange, onCloseAutoFocus, packs, labels, category, onCategoryChange, query, onQueryChange, selectedId, resetKey, mode, onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
  packs: PackOverview[]
  labels: Labels
  category: string | null
  onCategoryChange: (value: string | null) => void
  query: string
  onQueryChange: (value: string) => void
  selectedId: string | undefined
  resetKey: number
  mode: PracticeMode
  onSelect: (id: string) => void
}) {
  const t = useTranslations('practice')
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle>{t('picker.title')}</DialogTitle>
        <DialogDescription>{t('picker.description')}</DialogDescription>
      </DialogHeader>
      <SearchField value={query} onChange={onQueryChange} placeholder={t('picker.filter')} ariaLabel={t('picker.filter')} className="h-10" />
      <CategorySelect labels={labels} value={category} onChange={onCategoryChange} size="large" />
      {packs.length ? <WordListOptions label={t('picker.candidates')} packs={packs} selectedId={selectedId} query={query} resetKey={resetKey} mode={mode} onSelect={onSelect} />
        : <p className="px-1 py-2 text-sm text-muted-foreground">{t('picker.noMatch')}</p>}
    </DialogContent>
  </Dialog>
}
