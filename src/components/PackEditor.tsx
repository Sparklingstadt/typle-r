"use client"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ChevronLeft, CircleAlert } from "lucide-react"
import { DndContext, closestCenter, type Announcements, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import PageStorageBadge from "@/components/PageStorageBadge"
import SortableListRow from "@/components/SortableListRow"
import PackFields, { PACK_NAME_FIELD, samePackInput } from "@/components/WordLists/PackFields"
import { listLabels } from "@/core/listOverview"
import type { PackInput } from "@/core/packEditing"
import type { ErrorKey } from "@/core/appError"
import type { SavedWordList } from "@/core/wordLists"
import type { WorkspaceLocation } from "@/core/workspaceStore"
import type { WordPack } from "@/core/wordPacks"

const fieldsOf = (pack: WordPack): PackInput => ({ name: pack.name, description: pack.description ?? "", category: pack.category ?? "", tags: pack.tags ?? [] })

// Another tab may add or delete a list of the pack while it is edited: the order keeps the ids that still exist, then the new lists.
const rebuild = (order: string[], lists: SavedWordList[]) => {
  const ids = new Set(lists.map(list => list.id))
  const kept = order.filter(id => ids.has(id))
  return [...kept, ...lists.map(list => list.id).filter(id => !kept.includes(id))]
}

// Edits a pack: its fields and the order of its lists. Leaving with unsaved changes asks first.
export default function PackEditor({ pack, lists, packs, storage, error, errorKey, onSave, onCancel }: {
  pack: WordPack
  /** The pack's lists, in saved order. */
  lists: SavedWordList[]
  /** Every pack, whose categories and tags are offered while typing. */
  packs: WordPack[]
  storage?: WorkspaceLocation
  error?: string
  errorKey?: ErrorKey | null
  onSave: (fields: PackInput, listIds: string[]) => Promise<boolean>
  onCancel: () => void
}) {
  const t = useTranslations("wordLists.packEditor")
  const editor = useTranslations("wordLists.editor")
  const page = useTranslations("wordLists.page")
  const form = useTranslations("common.form")
  const errors = useTranslations("errors")
  const locale = useLocale()
  const dragId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [initialFields] = useState(() => fieldsOf(pack))
  const [initialOrder] = useState(() => lists.map(list => list.id))
  const [fields, setFields] = useState(initialFields)
  const [storedOrder, setOrder] = useState(initialOrder)
  const [saving, setSaving] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [failedName, setFailedName] = useState<string | null>(null)
  // After a failed save, the name field is focused only when the error is about the name.
  const [focusRequest, setFocusRequest] = useState(0)
  const order = rebuild(storedOrder, lists)
  const dirty = !samePackInput(fields, initialFields) || order.join("\n") !== rebuild(initialOrder, lists).join("\n")
  const suggestions = useMemo(() => listLabels(packs, locale), [packs, locale])
  const byId = useMemo(() => new Map(lists.map(list => [list.id, list])), [lists])

  // Closing or reloading the tab would lose the changes, so the browser asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Moves a list to the place `target` of the order shown.
  function move(id: string, target: number) {
    const from = order.indexOf(id)
    if (saving || from < 0 || target < 0 || target >= order.length || target === from) return
    setOrder(arrayMove(order, from, target))
  }

  // Screen readers hear the list's name and place, not its id.
  const nameOf = (id: string | number) => byId.get(String(id))?.name ?? ""
  const placeOf = (id: string | number) => ({ position: order.indexOf(String(id)) + 1, total: order.length })
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("announceStart", { name: nameOf(active.id), ...placeOf(active.id) }),
    onDragOver: ({ active, over }) => over ? t("announceOver", { name: nameOf(active.id), ...placeOf(over.id) }) : t("announceOutside", { name: nameOf(active.id) }),
    onDragEnd: ({ active, over }) => over ? t("announceEnd", { name: nameOf(active.id), ...placeOf(over.id) }) : t("announceCancel", { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => t("announceCancel", { name: nameOf(active.id) }),
  }

  function cancel() {
    if (dirty) setConfirmingCancel(true)
    else onCancel()
  }
  // The name's error follows the name it was found for, and goes once the name changes.
  const nameKeyError = errorKey === "packNameRequired" || errorKey === "packNameDuplicate"
  const nameError = nameKeyError && failedName === fields.name ? errors(errorKey) : undefined
  const serverError = error && !nameKeyError ? error : ""
  const handledFocus = useRef(0)
  useEffect(() => {
    if (focusRequest === handledFocus.current) return
    handledFocus.current = focusRequest
    if (nameKeyError) document.querySelector<HTMLElement>(`input[name="${PACK_NAME_FIELD}"]`)?.focus()
  }, [focusRequest, nameKeyError])

  return <form noValidate onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFailedName(fields.name)
    try {
      const saved = await onSave(fields, order)
      if (!saved) setFocusRequest(count => count + 1)
    } finally { setSaving(false) }
  }}>
    <Button variant="ghost" size="lg" className="-ml-2.5 mb-2 text-muted-foreground" onClick={cancel}><ChevronLeft aria-hidden="true" />{page("title")}</Button>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("editTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("editDescription")}</p>
      </div>
      <PageStorageBadge storage={storage} />
    </header>

    <div className="space-y-6">
      <PackFields value={fields} onChange={setFields} suggestions={suggestions} nameError={nameError} />
      <section aria-labelledby={`${dragId}-lists`} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
        <div className="space-y-1">
          <h2 id={`${dragId}-lists`} className="text-base font-bold">{t("lists")}</h2>
          <p className="text-xs text-muted-foreground">{t("listsHelp")}</p>
        </div>
        <DndContext id={dragId} sensors={sensors} collisionDetection={closestCenter}
          accessibility={{ screenReaderInstructions: { draggable: t("dragInstructions") }, announcements }}
          onDragEnd={({ active, over }) => {
            if (saving || !over || active.id === over.id) return
            move(String(active.id), order.indexOf(String(over.id)))
          }}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {order.map((id, index) => {
                const list = byId.get(id)
                if (!list) return null
                return <SortableListRow key={id} id={id} name={list.name} index={index} count={order.length} disabled={saving || order.length < 2}
                  onMove={target => move(id, target)}
                  levels={list.levels?.length ? t("levels", { levels: list.levels.join("・") }) : t("noLevels")}
                  wordCount={t("wordCount", { count: list.words.length })} />
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </section>
    </div>

    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.05)] backdrop-blur sm:bottom-4 sm:mx-0 sm:mb-4 sm:rounded-xl sm:border sm:px-5 sm:shadow-lg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex-1 sm:basis-auto">
          {serverError ? <p role="alert" className="flex items-start gap-1.5 text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{serverError}
          </p> : dirty ? <>
            <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="font-medium">{editor("unsaved")}</span>
          </> : <span className="text-muted-foreground">{editor("noChanges")}</span>}
        </div>
        <Button variant="ghost" onClick={cancel}>{form("cancel")}</Button>
        <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">{saving ? form("saving") : editor("save")}</Button>
      </div>
    </div>
    <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{editor("discardTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{editor("discardDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{editor("keepEditing")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onCancel}>{editor("discard")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </form>
}
