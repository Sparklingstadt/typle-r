"use client"
import { useId, type ComponentProps } from "react"
import { useTranslations } from "next-intl"
import { useFormat } from "@/i18n/useFormat"
import { GripVertical, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { WORD_ROW_COLUMNS } from "@/components/SortableWordRow"
import WordListImport from "@/components/WordListImport"
import WordRowFields from "@/components/WordLists/WordRowFields"
import { MAX_WORDS, type DraftWord, type Word } from "@/core/wordDraft"

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border bg-background px-1.5 py-px font-sans text-[11px] font-medium text-foreground/70">{children}</kbd>
}

export default function WordsSection({ words, baseId, displayId, inputId, saving, notice, filledCount, errorFor, onAdd, onChange, onMove, onRemove, onReorder, onImport }: {
  words: DraftWord[]
  baseId: string
  displayId: (key: string) => string
  inputId: (key: string) => string
  saving: boolean
  notice: string
  filledCount: number
  errorFor: (id: string) => string | undefined
  onAdd: () => void
  onChange: (key: string, change: Partial<Word>) => void
  onMove: (index: number, target: number) => void
  onRemove: (index: number) => void
  onReorder: (activeId: string, overId: string) => void
  onImport: ComponentProps<typeof WordListImport>["onImport"]
}) {
  const t = useTranslations("wordLists.editor")
  const format = useFormat()
  const dragId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  return <section aria-labelledby={`${baseId}-words`} className="md:overflow-hidden md:rounded-xl md:border md:bg-card">
    <div className="flex flex-wrap items-center gap-2 pb-3 md:px-6 md:py-4">
      <h2 id={`${baseId}-words`} className="text-base font-bold">{t("words")}</h2>
      <Badge variant="secondary" className="tabular-nums">{format.number(words.length)} / {format.number(MAX_WORDS)}</Badge>
      <div className="ml-auto">
        <WordListImport disabled={saving} existingCount={filledCount} onImport={onImport} />
      </div>
      <p role="status" className="basis-full text-sm text-muted-foreground empty:hidden">{notice}</p>
    </div>
    <div aria-hidden="true" className={`hidden md:grid ${WORD_ROW_COLUMNS} border-y bg-muted px-6 py-2 text-xs font-medium text-muted-foreground`}>
      <span>#</span>
      <span>{t("display")}<span className="text-destructive">*</span></span>
      <span>{t("input")} <span className="font-normal">{t("inputHint")}</span></span>
      <span>{t("inputType")}</span>
      <span>{t("annotationOptional")}</span>
      <span />
    </div>
    <DndContext id={dragId} sensors={sensors} collisionDetection={closestCenter}
      accessibility={{ screenReaderInstructions: { draggable: t("dragInstructions") } }}
      onDragEnd={({ active, over }) => {
        if (saving || !over || active.id === over.id) return
        onReorder(String(active.id), String(over.id))
      }}>
    <SortableContext items={words.map(word => word.key)} strategy={verticalListSortingStrategy}>
    <div className="space-y-3 md:space-y-0">
    {words.map((word, index) => {
      const displayError = errorFor(displayId(word.key))
      const inputError = errorFor(inputId(word.key))
      return <WordRowFields key={word.key} word={word} index={index} count={words.length} baseId={baseId} displayId={displayId(word.key)} inputId={inputId(word.key)}
        saving={saving} displayError={displayError} inputError={inputError} onChange={change => onChange(word.key, change)}
        onMove={target => onMove(index, target)} onRemove={() => onRemove(index)} />
    })}
    </div>
    </SortableContext>
    </DndContext>
    <div className="space-y-3 pt-3 md:px-6 md:py-4">
      <Button variant="outline" className="w-full border-dashed text-muted-foreground" onClick={onAdd}><Plus aria-hidden="true" />{t("addWord")}</Button>
      <p className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:flex">
        <Kbd>Enter</Kbd>{t("shortcutNext")}
        <span aria-hidden="true">・</span><Kbd>Alt+↑↓</Kbd>{t("shortcutMove")}
        <span aria-hidden="true">・</span><Kbd>Ctrl（⌘）+Enter</Kbd>{t("shortcutSave")}
        <span aria-hidden="true">・</span><GripVertical className="size-3.5" aria-hidden="true" />{t("shortcutDrag")}
      </p>
    </div>
  </section>
}
