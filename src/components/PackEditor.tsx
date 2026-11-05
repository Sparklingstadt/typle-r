"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ChevronLeft, CircleAlert } from "lucide-react"
import { arrayMove } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import PageStorageBadge from "@/components/PageStorageBadge"
import PackFields, { PACK_NAME_FIELD, samePackInput } from "@/components/WordLists/PackFields"
import PackListChoices from "@/components/WordLists/PackListChoices"
import PackListOrder from "@/components/WordLists/PackListOrder"
import DiscardChangesDialog from "@/components/WordLists/DiscardChangesDialog"
import { useUnsavedWarning } from "@/lib/useUnsavedWarning"
import { listLabels } from "@/core/listOverview"
import { packFieldsOf, reconcileOrder, type PackInput } from "@/core/packEditing"
import type { ErrorKey } from "@/core/appError"
import type { SavedWordList } from "@/core/wordLists"
import type { WorkspaceLocation } from "@/core/workspaceStore"
import type { WordPack } from "@/core/wordPacks"
import { PageHeader } from "@/components/ui/page-layout"

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
  const [initialFields] = useState(() => packFieldsOf(pack))
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
  const order = pack ? reconcileOrder(storedOrder, lists) : lists.map(list => list.id).filter(id => chosen.includes(id))
  const dirty = !samePackInput(fields, initialFields) || order.join("\n") !== (pack ? reconcileOrder(initialOrder, lists) : []).join("\n")
  const suggestions = useMemo(() => listLabels(packs, locale), [packs, locale])
  const byId = useMemo(() => new Map(lists.map(list => [list.id, list])), [lists])

  useUnsavedWarning(dirty)

  // Moves a list to the place `target` of the order shown.
  function move(id: string, target: number) {
    const from = order.indexOf(id)
    if (saving || from < 0 || target < 0 || target >= order.length || target === from) return
    setOrder(arrayMove(order, from, target))
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
    <PageHeader title={t(pack ? "editTitle" : "createTitle")} description={t(pack ? "editDescription" : "createDescription")}>
      <PageStorageBadge storage={storage} />
    </PageHeader>

    <div className="space-y-6">
      <PackFields value={fields} onChange={setFields} suggestions={suggestions} nameError={nameError} />
      {!pack ? <PackListChoices lists={lists} packs={packs} chosen={chosen} onChange={setChosen} query={query} onQuery={setQuery} disabled={saving} />
      : <PackListOrder order={order} byId={byId} saving={saving} onMove={move} />}
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
    <DiscardChangesDialog open={confirmingCancel} onOpenChange={setConfirmingCancel} onDiscard={onCancel} />
  </form>
}
