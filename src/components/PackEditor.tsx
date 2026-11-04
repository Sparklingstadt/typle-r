"use client"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ChevronLeft, CircleAlert } from "lucide-react"
import { SearchField } from "@/components/ui/search-field"
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

const fieldsOf = (pack?: WordPack): PackInput => ({ name: pack?.name ?? "", description: pack?.description ?? "", category: pack?.category ?? "", tags: pack?.tags ?? [] })

// Another tab may add or delete a list of the pack while it is edited: the order keeps the ids that still exist, then the new lists.
const rebuild = (order: string[], lists: SavedWordList[]) => {
  const ids = new Set(lists.map(list => list.id))
  const kept = order.filter(id => ids.has(id))
  return [...kept, ...lists.map(list => list.id).filter(id => !kept.includes(id))]
}

// Edits a pack: its fields and the order of its lists. Without `pack` it creates one, of the lists chosen from `lists`.
// Leaving with unsaved changes asks first.
export default function PackEditor({ pack, lists, packs, storage, error, errorKey, onSave, onCancel }: {
  pack?: WordPack
  /** The pack's lists, in saved order; when creating, the lists that can be chosen for the new pack. */
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
  const [initialOrder] = useState(() => pack ? lists.map(list => list.id) : [])
  const [fields, setFields] = useState(initialFields)
  const [storedOrder, setOrder] = useState(initialOrder)
  const [saving, setSaving] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [failedName, setFailedName] = useState<string | null>(null)
  // After a failed save, the name field is focused only when the error is about the name.
  const [focusRequest, setFocusRequest] = useState(0)
  // When creating, the order is the lists chosen, kept in the order they are offered.
  const [chosen, setChosen] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const order = pack ? rebuild(storedOrder, lists) : lists.map(list => list.id).filter(id => chosen.includes(id))
  const dirty = !samePackInput(fields, initialFields) || order.join("\n") !== (pack ? rebuild(initialOrder, lists) : []).join("\n")
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
        <h1 className="text-2xl font-bold">{t(pack ? "editTitle" : "createTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t(pack ? "editDescription" : "createDescription")}</p>
      </div>
      <PageStorageBadge storage={storage} />
    </header>

    <div className="space-y-6">
      <PackFields value={fields} onChange={setFields} suggestions={suggestions} nameError={nameError} />
      {!pack ? <ListChoices lists={lists} packs={packs} chosen={chosen} onChange={setChosen} query={query} onQuery={setQuery} disabled={saving} />
      : <section aria-labelledby={`${dragId}-lists`} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
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
      </section>}
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

// The lists a new pack is made of, chosen with check boxes. A list's pack is named when the pack holds other lists too,
// since choosing the list takes it out of that pack.
function ListChoices({ lists, packs, chosen, onChange, query, onQuery, disabled }: {
  lists: SavedWordList[]
  packs: WordPack[]
  chosen: string[]
  onChange: (ids: string[]) => void
  query: string
  onQuery: (query: string) => void
  disabled: boolean
}) {
  const t = useTranslations("wordLists.packEditor")
  const id = useId()
  const packName = new Map(packs.map(pack => [pack.id, pack.name]))
  const sizes = new Map<string, number>()
  for (const list of lists) sizes.set(list.packId ?? "", (sizes.get(list.packId ?? "") ?? 0) + 1)
  const needle = query.trim().toLocaleLowerCase()
  const shown = lists.filter(list => !needle || list.name.toLocaleLowerCase().includes(needle) || packName.get(list.packId ?? "")?.toLocaleLowerCase().includes(needle))
  return <section aria-labelledby={`${id}-heading`} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={`${id}-heading`} className="text-base font-bold">{t("choose")}</h2>
        <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">{t("chosen", { count: chosen.length })}</span>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">{t("chooseHelp")}</p>
    </div>
    <SearchField value={query} onChange={onQuery} placeholder={t("chooseFilter")} ariaLabel={t("chooseFilter")} className="h-10" />
    {shown.length ? <ul aria-labelledby={`${id}-heading`} aria-describedby={`${id}-help`} className="grid max-h-[28rem] gap-1 overflow-y-auto overscroll-contain">
      {shown.map(list => {
        const checked = chosen.includes(list.id)
        const inPack = (sizes.get(list.packId ?? "") ?? 0) >= 2 ? packName.get(list.packId ?? "") : undefined
        return <li key={list.id}>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:checked]:bg-muted">
            {/* Named by the list alone; its pack, levels and words describe it. */}
            <input type="checkbox" checked={checked} disabled={disabled} aria-labelledby={`${id}-${list.id}`} aria-describedby={`${id}-${list.id}-about`}
              className="size-4 shrink-0 accent-primary outline-none"
              onChange={event => onChange(event.target.checked ? [...chosen, list.id] : chosen.filter(item => item !== list.id))} />
            <span className="grid min-w-0">
              <span id={`${id}-${list.id}`} className="text-sm font-medium [overflow-wrap:anywhere]">{list.name}</span>
              <span id={`${id}-${list.id}-about`} className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {[inPack && t("inPack", { name: inPack }), list.levels?.length ? t("levels", { levels: list.levels.join("・") }) : null, t("wordCount", { count: list.words.length })].filter(Boolean).join(" · ")}
              </span>
            </span>
          </label>
        </li>
      })}
    </ul> : <p className="px-1 py-2 text-sm text-muted-foreground">{t("noMatch")}</p>}
  </section>
}
