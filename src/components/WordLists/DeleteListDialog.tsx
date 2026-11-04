"use client"
import { useRef } from "react"
import { useTranslations } from "next-intl"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useFormat } from "@/i18n/useFormat"
import { focusAfterRemoval } from "@/lib/focusAfterRemoval"
import type { ListOverview } from "@/core/listOverview"
import type { SavedWordList } from "@/core/wordLists"

export default function DeleteListDialog({ state, lonePackName, now, onOpenChange, onExport, onDelete }: {
  state: { open: boolean; item: ListOverview | null; position: number }
  /** The name of the pack that goes with its last list, if any. */
  lonePackName: string | undefined
  now: Date
  onOpenChange: (open: boolean) => void
  onExport: (list: SavedWordList) => void
  onDelete: (list: SavedWordList) => Promise<boolean>
}) {
  const t = useTranslations('wordLists')
  const deleted = useRef(false)
  if (!state.item) return null
  const item = state.item
  return <DeleteConfirmation open={state.open} onOpenChange={onOpenChange}
    title={t('delete.title', { name: item.list.name })}
    description={[item.practiceCount ? t('delete.withRecords') : t('delete.listOnly'), lonePackName ? t('delete.lastInPack', { name: lonePackName }) : ''].filter(Boolean).join(' ')}
    // After a deletion, focus the row that took the removed row's place so the next list can be handled too.
    onCloseAutoFocus={event => {
      focusAfterRemoval(event, '[data-list-id] [data-edit]', state.position, deleted.current)
      deleted.current = false
    }}
    onConfirm={async () => {
      const list = state.item?.list
      if (!list) return false
      const saved = await onDelete(list)
      if (saved) deleted.current = true
      return saved
    }}>
    <DeleteDetails item={item} now={now} onExport={() => onExport(item.list)} />
  </DeleteConfirmation>
}

function DeleteDetails({ item, now, onExport }: { item: ListOverview; now: Date; onExport: () => void }) {
  const t = useTranslations('wordLists.delete')
  const format = useFormat()
  const { list } = item
  return <div className="space-y-3">
    <dl className="grid gap-1 rounded-lg border bg-muted/40 px-3.5 py-3 text-sm">
      <dt className="sr-only">{t('list')}</dt><dd className="font-medium [overflow-wrap:anywhere]">{list.name}</dd>
      <dt className="sr-only">{t('contents')}</dt>
      <dd className="text-[13px] text-muted-foreground tabular-nums">
        {t('wordCount', { count: list.words.length })} · {item.lastPracticed === null ? t('noRecords')
          : t('records', { count: item.practiceCount, day: format.day(new Date(item.lastPracticed), now) })}
      </dd>
    </dl>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
      <span className="min-w-0 flex-1 basis-56">{t('exportHint')}</span>
      <Button variant="outline" size="lg" className="text-foreground" onClick={onExport}><Download aria-hidden="true" />{t('export')}</Button>
    </div>
  </div>
}
