"use client"
import { useId } from "react"
import { useTranslations } from "next-intl"
import { DndContext, closestCenter, type Announcements, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import SortableListRow from "@/components/SortableListRow"
import type { SavedWordList } from "@/core/wordLists"

// The order of a pack's lists, changed by dragging or with the keyboard.
export default function PackListOrder({ order, byId, saving, onMove }: {
  order: string[]
  byId: Map<string, SavedWordList>
  saving: boolean
  /** Moves a list to the place `target` of `order`. */
  onMove: (id: string, target: number) => void
}) {
  const t = useTranslations("wordLists.packEditor")
  const dragId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Screen readers hear the list's name and place, not its id.
  const nameOf = (id: string | number) => byId.get(String(id))?.name ?? ""
  const placeOf = (id: string | number) => ({ position: order.indexOf(String(id)) + 1, total: order.length })
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("announceStart", { name: nameOf(active.id), ...placeOf(active.id) }),
    onDragOver: ({ active, over }) => over ? t("announceOver", { name: nameOf(active.id), ...placeOf(over.id) }) : t("announceOutside", { name: nameOf(active.id) }),
    onDragEnd: ({ active, over }) => over ? t("announceEnd", { name: nameOf(active.id), ...placeOf(over.id) }) : t("announceCancel", { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => t("announceCancel", { name: nameOf(active.id) }),
  }

  return <section aria-labelledby={`${dragId}-lists`} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
    <div className="space-y-1">
      <h2 id={`${dragId}-lists`} className="text-base font-bold">{t("lists")}</h2>
      <p className="text-xs text-muted-foreground">{t("listsHelp")}</p>
    </div>
    <DndContext id={dragId} sensors={sensors} collisionDetection={closestCenter}
      accessibility={{ screenReaderInstructions: { draggable: t("dragInstructions") }, announcements }}
      onDragEnd={({ active, over }) => {
        if (saving || !over || active.id === over.id) return
        onMove(String(active.id), order.indexOf(String(over.id)))
      }}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {order.map((id, index) => {
            const list = byId.get(id)
            if (!list) return null
            return <SortableListRow key={id} id={id} name={list.name} index={index} count={order.length} disabled={saving || order.length < 2}
              onMove={target => onMove(id, target)}
              levels={list.levels?.length ? t("levels", { levels: list.levels.join("・") }) : t("noLevels")}
              wordCount={t("wordCount", { count: list.words.length })} />
          })}
        </ul>
      </SortableContext>
    </DndContext>
  </section>
}
