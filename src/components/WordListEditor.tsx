"use client"
import { randomId } from "../core/randomId"
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { ChevronLeft } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useWordDraft } from "@/lib/useWordDraft"
import { useUnsavedWarning } from "@/lib/useUnsavedWarning"
import type { SavedWordList, WritingLanguage } from "@/core/wordLists"
import type { WordPack } from "@/core/wordPacks"
import type { WorkspaceLocation } from "@/core/workspaceStore"
import type { ErrorKey } from "@/core/appError"
import { currentRecordCount } from "@/core/listOverview"
import PageStorageBadge from "@/components/PageStorageBadge"
import WordListBasics from "@/components/WordLists/WordListBasics"
import WordsSection from "@/components/WordLists/WordsSection"
import WordListSaveBar from "@/components/WordLists/WordListSaveBar"
import { draftProblems, draftSnapshot, emptyWord, normalizeWord, savedWords } from "@/core/wordDraft"

export default function WordListEditor({ title, description, storage, initial, packs = [], packId, choosePack = true, lonePackName, error, errorKey, packFields, packDirty = false, onSave, onCancel, onDirtyChange, cancelRequest = 0 }: {
  title: string
  description?: ReactNode
  storage?: WorkspaceLocation
  initial?: SavedWordList
  /** The packs a list can be put in. */
  packs?: WordPack[]
  /** The pack that is chosen at first; `null`, a pack that is gone, or none given at all means a new pack named after the list. */
  packId?: string | null
  /** Whether the pack is chosen on the form. Without the choice the list is saved to `packId` as given, or to a pack of its own. */
  choosePack?: boolean
  /** The name of the pack when `initial` is its only list: choosing another pack deletes it, which is said under the choice. */
  lonePackName?: string
  error?: string
  /** Which error `error` is, so a duplicate name can be shown on the name field. */
  errorKey?: ErrorKey | null
  /** The fields of a pack that this list starts, shown above the list's own. The pack is then not chosen. */
  packFields?: ReactNode
  /** Whether `packFields` has unsaved changes, which are confirmed before leaving like the list's own. */
  packDirty?: boolean
  /** `packId` is the chosen pack, or null for a new pack. The list carries neither category, tags nor group: those belong to the pack. */
  onSave: (list: SavedWordList, packId: string | null) => Promise<boolean>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  /** Increment to leave the editor as if キャンセル was pressed: unsaved changes are confirmed first. */
  cancelRequest?: number
}) {
  const t = useTranslations("wordLists.editor")
  const form = useTranslations("common.form")
  const errors = useTranslations("errors")
  const baseId = useId()
  const nameId = `${baseId}-name`
  const displayId = (key: string) => `${baseId}-display-${key}`
  const inputId = (key: string) => `${baseId}-input-${key}`
  const [name, setName] = useState(initial?.name ?? "")
  const [firstPackId] = useState(() => {
    const wanted = packId === undefined ? initial?.packId : packId
    return wanted && packs.some(pack => pack.id === wanted) ? wanted : null
  })
  const [chosenPack, setChosenPack] = useState<string | null>(firstPackId)
  const [levels, setLevels] = useState(initial?.levels ?? [])
  const { words, filled, add, moveTo, remove, update, reorder, load } = useWordDraft(initial, focusDisplay)
  // `null` is off; the list then has no `writing` mark at all.
  const [writing, setWriting] = useState<WritingLanguage | null>(initial?.writing?.language ?? null)
  const [initialSnapshot] = useState(() => draftSnapshot(initial?.name ?? "", firstPackId, initial?.levels ?? [], initial?.writing?.language ?? null, (initial?.words ?? [emptyWord()]).map(normalizeWord)))
  const leavingLonePack = !!lonePackName && !!initial?.packId && chosenPack !== initial.packId
  const dirty = draftSnapshot(name, chosenPack, levels, writing, words) !== initialSnapshot || packDirty

  const draftId = useRef<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState("")
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useUnsavedWarning(dirty)

  // Errors appear after the first save attempt and then follow the user's edits.
  const problems = draftProblems(name, words).map(problem =>
    problem.field === "name" ? { id: nameId, message: errors("listNameRequired") }
    : problem.field === "display" ? { id: displayId(problem.key), message: t("displayRequired") }
    : { id: inputId(problem.key), message: t("inputBlank") })
  const shown = submitted ? problems : []
  const errorFor = (id: string) => shown.find(problem => problem.id === id)?.message

  // The duplicate-name check runs while saving; show it on the name field until the name changes.
  const [failure, setFailure] = useState<{ count: number; name: string; pack: string | null; levels: string }>({ count: 0, name: "", pack: null, levels: "" })
  const duplicate = errorKey === "listNameDuplicate" && failure.name === name && failure.pack === chosenPack
  // A level that clashes with another list of the pack (or more than one level, which the editor never sends) is shown
  // under the level until the level, name or pack change.
  const levelError = (errorKey === "levelsConflict" || errorKey === "tooManyLevels") && failure.name === name && failure.pack === chosenPack && failure.levels === JSON.stringify(levels)
  // A pack's name is shown on its own field by whoever passes `packFields`.
  const serverError = error && errorKey !== "listNameDuplicate" && errorKey !== "levelsConflict" && errorKey !== "tooManyLevels" &&
    errorKey !== "packNameRequired" && errorKey !== "packNameDuplicate" ? error : ""
  const nameError = errorFor(nameId) ?? (duplicate ? error : undefined)
  const handledFailure = useRef(0)
  useEffect(() => {
    if (failure.count <= handledFailure.current) return
    handledFailure.current = failure.count
    if (errorKey === "listNameDuplicate") document.getElementById(nameId)?.focus()
  }, [failure, errorKey, nameId])

  function focusField(id: string) {
    const field = document.getElementById(id)
    field?.focus()
    field?.scrollIntoView({ block: "center" })
  }

  function focusDisplay(key: string) {
    document.getElementById(displayId(key))?.focus()
  }

  function addWord() {
    // Once everything is valid, a freshly added row is not flagged until the next save.
    if (!problems.length) setSubmitted(false)
    add()
  }

  function cancel() {
    if (dirty) setConfirmingCancel(true)
    else onCancel()
  }
  // Asked from outside (the browser's back button): only unsaved changes need an answer.
  const [seenCancelRequest, setSeenCancelRequest] = useState(cancelRequest)
  if (cancelRequest !== seenCancelRequest) {
    setSeenCancelRequest(cancelRequest)
    if (dirty) setConfirmingCancel(true)
  }

  // Enter moves to the next word instead of submitting; the last filled word gets a new row.
  // Alt+Arrow keys move the current word. Ctrl/Cmd+Enter saves.
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const target = event.target
    if (!(target instanceof HTMLInputElement) || target.type === "file" || target.type === "radio") return
    const index = words.findIndex(word => word.key === target.dataset.wordKey)
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && index >= 0) {
      event.preventDefault()
      moveTo(index, index + (event.key === "ArrowUp" ? -1 : 1))
      return
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      event.currentTarget.requestSubmit()
      return
    }
    if (saving) return
    if (index < words.length - 1) {
      focusDisplay(words[index + 1].key)
      return
    }
    if (words[index]?.display.trim()) addWord()
  }

  // Changing the word count changes the task: runs at the old count stay, but no longer count towards the best.
  const ranked = initial ? currentRecordCount(initial) : 0
  const recount = initial && ranked > 0 && filled.length !== initial.words.length ? { from: initial.words.length, to: filled.length, records: ranked } : null
  return <form noValidate onKeyDown={handleKeyDown} onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    setSubmitted(true)
    if (problems.length) {
      focusField(problems[0].id)
      return
    }
    draftId.current ??= initial?.id ?? randomId()
    setSaving(true)
    try {
      // The category, tags and group are the pack's, so the list does not carry them.
      const saved = await onSave({ id: draftId.current, name, levels, packId: initial?.packId, ...(writing ? { writing: { language: writing } } : {}),
        words: savedWords(words),
        records: initial?.records ?? [], createdAt: initial?.createdAt ?? new Date().toISOString() }, packFields ? null : chosenPack)
      if (!saved) setFailure(current => ({ count: current.count + 1, name, pack: chosenPack, levels: JSON.stringify(levels) }))
    } finally { setSaving(false) }
  }}>
    <Button variant="ghost" size="lg" className="-ml-2.5 mb-2 text-muted-foreground" onClick={cancel}><ChevronLeft aria-hidden="true" />{t("back")}</Button>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description ?? t("description")}</p>
      </div>
      <PageStorageBadge storage={storage} />
    </header>

    <div className="space-y-6">
      {packFields}
      <WordListBasics baseId={baseId} nameId={nameId} hasPackFields={!!packFields} choosePack={choosePack} packs={packs} chosenPack={chosenPack} setChosenPack={setChosenPack}
        leavingLonePack={leavingLonePack} lonePackName={lonePackName} name={name} setName={setName} nameError={nameError} nameAlert={duplicate && !errorFor(nameId)}
        levels={levels} setLevels={setLevels} levelError={levelError} error={error} refusals={failure.count} writing={writing} setWriting={setWriting} />

      <WordsSection words={words} baseId={baseId} displayId={displayId} inputId={inputId} saving={saving} notice={notice} filledCount={filled.length} errorFor={errorFor}
        onAdd={addWord} onChange={update} onMove={moveTo} onRemove={remove} onReorder={reorder}
        onImport={(imported, filename, mode) => {
          const kept = load(imported, mode)
          setName(value => value.trim() ? value : filename)
          setNotice(t(kept ? "added" : "loaded", { count: imported.length }))
        }} />
    </div>

    <WordListSaveBar recount={recount} errorCount={shown.length} onFirstError={() => focusField(shown[0].id)} serverError={serverError}
      dirty={dirty} wordCount={words.length} saving={saving} onCancel={cancel} />
    <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("discardTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("discardDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onCancel}>{t("discard")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </form>
}
