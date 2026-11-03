"use client"
import { randomId } from "../core/randomId"
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { useLocale, useTranslations } from "next-intl"
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, ChevronLeft, CircleAlert, GripVertical, Info, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import WordListImport from "./WordListImport"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import SortableWordRow, { WORD_ROW_COLUMNS } from "./SortableWordRow"
import { WRITING_LANGUAGES, type InputType, type SavedWordList, type WritingLanguage } from "@/core/wordLists"
import type { WordPack } from "@/core/wordPacks"
import type { WorkspaceLocation } from "@/core/workspaceStore"
import { AppError, type ErrorKey } from "@/core/appError"
import { currentRecordCount } from "@/core/listOverview"
import PageStorageBadge from "@/components/PageStorageBadge"
import LevelFields from "@/components/WordLists/LevelFields"
import FieldError from "@/components/WordLists/FieldError"

type Word = SavedWordList["words"][number]
const MAX_WORDS = 1000
const emptyWord = (): Word => ({ display: "", input: "", annotation: "", input_type: "word" })
// An input equal to the display is shown as empty; saving uses the display for empty inputs.
const normalize = (word: Word): Word => ({ ...word, input: word.input === word.display ? "" : word.input, input_type: word.input_type ?? "word" })
const snapshot = (name: string, packId: string | null, levels: string[], writing: WritingLanguage | null, words: Word[]) =>
  JSON.stringify([name, packId, levels, writing, words.map(word => [word.display, word.input, word.annotation, word.input_type ?? "word"])])
// The recognition language a list starts with when the switch is turned on: the display language, or English when it has no counterpart.
const WRITING_DEFAULTS: Record<string, WritingLanguage> = { ja: "ja", en: "en", fr: "fr", ru: "ru", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" }
const isFilled = (word: Word) => !!(word.display || word.input || word.annotation)
const menuItem = "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4"

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border bg-background px-1.5 py-px font-sans text-[11px] font-medium text-foreground/70">{children}</kbd>
}

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
  const packSelectId = `${baseId}-pack`
  const writingId = `${baseId}-writing`
  const writingLanguageId = `${baseId}-writing-language`
  const displayId = (key: string) => `${baseId}-display-${key}`
  const inputId = (key: string) => `${baseId}-input-${key}`
  const dragId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [name, setName] = useState(initial?.name ?? "")
  const [firstPackId] = useState(() => {
    const wanted = packId === undefined ? initial?.packId : packId
    return wanted && packs.some(pack => pack.id === wanted) ? wanted : null
  })
  const [chosenPack, setChosenPack] = useState<string | null>(firstPackId)
  const [levels, setLevels] = useState(initial?.levels ?? [])
  const [words, setWords] = useState(() => (initial?.words ?? [emptyWord()]).map((word, index) => ({ ...normalize(word), key: `initial-${index}` })))
  const locale = useLocale()
  // `null` is off; the list then has no `writing` mark at all.
  const [writing, setWriting] = useState<WritingLanguage | null>(initial?.writing?.language ?? null)
  const [initialSnapshot] = useState(() => snapshot(initial?.name ?? "", firstPackId, initial?.levels ?? [], initial?.writing?.language ?? null, (initial?.words ?? [emptyWord()]).map(normalize)))
  const leavingLonePack = !!lonePackName && !!initial?.packId && chosenPack !== initial.packId
  const dirty = snapshot(name, chosenPack, levels, writing, words) !== initialSnapshot || packDirty

  const draftId = useRef<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState("")
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  // Closing or reloading the tab would lose the changes, so the browser asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Errors appear after the first save attempt and then follow the user's edits.
  const problems: { id: string; message: string }[] = []
  if (!name.trim()) problems.push({ id: nameId, message: errors("listNameRequired") })
  for (const word of words) {
    if (!word.display.trim()) problems.push({ id: displayId(word.key), message: t("displayRequired") })
    else if (word.input && !word.input.trim()) problems.push({ id: inputId(word.key), message: t("inputBlank") })
  }
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
    const key = randomId()
    // Once everything is valid, a freshly added row is not flagged until the next save.
    if (!problems.length) setSubmitted(false)
    flushSync(() => setWords(current => [...current, { ...emptyWord(), key }]))
    focusDisplay(key)
  }

  function moveTo(index: number, target: number) {
    if (target < 0 || target >= words.length || target === index) return
    setWords(current => arrayMove(current, index, target))
  }

  function remove(index: number) {
    if (words.length < 2) return
    const neighbor = words[index + 1] ?? words[index - 1]
    setWords(current => current.filter((_, position) => position !== index))
    // Wait for menus to close and return focus before moving it to the next word.
    requestAnimationFrame(() => focusDisplay(neighbor.key))
  }

  function update(key: string, change: Partial<Word>) {
    setWords(current => current.map(item => item.key === key ? { ...item, ...change } : item))
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

  const filled = words.filter(isFilled)
  // Changing the word count changes the task: runs at the old count stay, but no longer count towards the best.
  const ranked = initial ? currentRecordCount(initial) : 0
  const recount = ranked > 0 && filled.length !== initial?.words.length
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
        words: words.map(({ key, ...word }) => ({ ...word, input: word.input || word.display })),
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
      <section className="space-y-2 rounded-xl border bg-card p-4 sm:p-6" aria-label={t("basics")}>
        {!packFields && !choosePack && chosenPack && <p className="pb-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {t("addingTo", { name: packs.find(pack => pack.id === chosenPack)?.name ?? "" })}
        </p>}
        {!packFields && choosePack && <>
          <Label htmlFor={packSelectId}>{t("pack")}</Label>
          <select id={packSelectId} value={chosenPack ?? ""} aria-describedby={`${leavingLonePack ? `${packSelectId}-deleted ` : ""}${packSelectId}-help`} onChange={event => setChosenPack(event.target.value || null)}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover">
            {packs.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
            <option value="">{t("newPack")}</option>
          </select>
          {leavingLonePack && <p id={`${packSelectId}-deleted`} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span className="[overflow-wrap:anywhere]">{t("packWillBeDeleted", { name: lonePackName })}</span>
          </p>}
          <p id={`${packSelectId}-help`} className="pb-2 text-xs text-muted-foreground">{t("packHelp")}</p>
        </>}
        <Label htmlFor={nameId}>{t("name")}<span aria-hidden="true" className="text-destructive">*</span></Label>
        <Input id={nameId} value={name} onChange={event => setName(event.target.value)} required aria-required="true"
          aria-invalid={nameError ? true : undefined} aria-describedby={`${nameId}-help${nameError ? ` ${nameId}-error` : ""}`} className="h-11" />
        {nameError ? <FieldError id={`${nameId}-error`} message={nameError} alert={duplicate && !errorFor(nameId)} />
          : null}
        <p id={`${nameId}-help`} className="text-xs text-muted-foreground">{t("nameHelp")}</p>
        <LevelFields value={levels} onChange={setLevels} error={levelError ? error ?? "" : undefined} refusals={failure.count} />
        <div className="flex items-center gap-3 pt-2">
          <Switch id={writingId} checked={writing !== null} aria-describedby={`${writingId}-help`}
            onCheckedChange={on => setWriting(on ? WRITING_DEFAULTS[locale] ?? "en" : null)} />
          <Label htmlFor={writingId}>{t("writingToggle")}</Label>
        </div>
        <p id={`${writingId}-help`} className="text-xs text-muted-foreground">{t("writingToggleHelp")}</p>
        {writing && <>
          <Label htmlFor={writingLanguageId}>{t("writingLanguage")}</Label>
          <select id={writingLanguageId} value={writing} onChange={event => setWriting(event.target.value as WritingLanguage)}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover">
            {WRITING_LANGUAGES.map(code => <option key={code} value={code}>{t(`writingLanguages.${code}`)}</option>)}
          </select>
        </>}
      </section>

      <section aria-labelledby={`${baseId}-words`} className="md:overflow-hidden md:rounded-xl md:border md:bg-card">
        <div className="flex flex-wrap items-center gap-2 pb-3 md:px-6 md:py-4">
          <h2 id={`${baseId}-words`} className="text-base font-bold">{t("words")}</h2>
          <Badge variant="secondary" className="tabular-nums">{words.length.toLocaleString()} / {MAX_WORDS.toLocaleString()}</Badge>
          <div className="ml-auto">
            <WordListImport disabled={saving} existingCount={filled.length} onImport={(imported, filename, mode) => {
              const current = mode === "replace" ? [] : filled
              if (current.length + imported.length > MAX_WORDS) throw new AppError("importTooManyRows")
              setWords([...current, ...imported.map(word => ({ ...normalize(word), key: randomId() }))])
              setName(value => value.trim() ? value : filename)
              setNotice(t(current.length ? "added" : "loaded", { count: imported.length }))
            }} />
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
            setWords(current => {
              const from = current.findIndex(word => word.key === active.id)
              const to = current.findIndex(word => word.key === over.id)
              return from < 0 || to < 0 ? current : arrayMove(current, from, to)
            })
          }}>
        <SortableContext items={words.map(word => word.key)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 md:space-y-0">
        {words.map((word, index) => {
          const n = index + 1
          const displayError = errorFor(displayId(word.key))
          const inputError = errorFor(inputId(word.key))
          const rowError = displayError ?? inputError
          return <SortableWordRow key={word.key} id={word.key} index={index} disabled={saving || words.length < 2} invalid={!!rowError}>
            <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
              <Input id={displayId(word.key)} data-word-key={word.key} aria-label={t("displayLabel", { n })} placeholder={t("displayPlaceholder")} value={word.display}
                required aria-required="true" aria-invalid={displayError ? true : undefined} aria-describedby={rowError ? `${displayId(word.key)}-error` : undefined}
                className="h-10" onChange={event => update(word.key, { display: event.target.value })} />
            </div>
            <div className="col-span-3 row-start-3 grid grid-cols-2 gap-2 md:contents">
              <div className="space-y-1 md:col-start-3 md:row-start-1 md:space-y-0">
                <Label htmlFor={inputId(word.key)} className="text-xs text-muted-foreground md:sr-only">{t("input")}</Label>
                <Input id={inputId(word.key)} data-word-key={word.key} aria-label={t("inputLabel", { n })} placeholder={word.display} value={word.input}
                  aria-invalid={inputError ? true : undefined} aria-describedby={inputError ? `${displayId(word.key)}-error` : undefined}
                  className="h-10" onChange={event => update(word.key, { input: event.target.value })} />
              </div>
              <div className="space-y-1 md:col-start-4 md:row-start-1 md:space-y-0">
                <Label htmlFor={`${baseId}-input-type-${word.key}`} className="text-xs text-muted-foreground md:sr-only">{t("inputType")}</Label>
                <select id={`${baseId}-input-type-${word.key}`} aria-label={t("inputTypeLabel", { n })} value={word.input_type ?? "word"}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  disabled={saving} onChange={event => update(word.key, { input_type: event.target.value as InputType })}>
                  <option value="word">{t("inputTypeWord")}</option>
                  <option value="command">{t("inputTypeCommand")}</option>
                  <option value="code">{t("inputTypeCode")}</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1 md:col-span-1 md:col-start-5 md:row-start-1 md:space-y-0">
                <Label htmlFor={`${baseId}-annotation-${word.key}`} className="text-xs text-muted-foreground md:sr-only">{t("annotation")}</Label>
                <Input id={`${baseId}-annotation-${word.key}`} data-word-key={word.key} aria-label={t("annotationLabel", { n })} placeholder={t("annotationPlaceholder")} value={word.annotation}
                  className="h-10" onChange={event => update(word.key, { annotation: event.target.value })} />
              </div>
            </div>
            <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 md:col-start-6">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label={t("wordActions", { n })} title={t("actions")}><MoreHorizontal aria-hidden="true" /></Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                    <DropdownMenu.Item className={menuItem} disabled={index === 0} aria-keyshortcuts="Alt+ArrowUp" onSelect={() => moveTo(index, index - 1)}>
                      <ArrowUp aria-hidden="true" />{t("moveUp")}<span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">Alt+↑</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} disabled={index === words.length - 1} aria-keyshortcuts="Alt+ArrowDown" onSelect={() => moveTo(index, index + 1)}>
                      <ArrowDown aria-hidden="true" />{t("moveDown")}<span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">Alt+↓</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} disabled={index === 0} onSelect={() => moveTo(index, 0)}>
                      <ArrowUpToLine aria-hidden="true" />{t("moveFirst")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} disabled={index === words.length - 1} onSelect={() => moveTo(index, words.length - 1)}>
                      <ArrowDownToLine aria-hidden="true" />{t("moveLast")}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item className={`${menuItem} text-destructive data-[highlighted]:text-destructive`} disabled={words.length < 2} onSelect={() => remove(index)}>
                      <Trash2 aria-hidden="true" />{t("deleteWord")}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <span className="hidden md:inline-flex">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={words.length < 2}
                  onClick={() => remove(index)} aria-label={t("deleteWordN", { n })} title={t("delete")}><Trash2 aria-hidden="true" /></Button>
              </span>
            </div>
            {rowError && <div className="col-span-3 row-start-4 md:col-span-4 md:col-start-2 md:row-start-2">
              <FieldError id={`${displayId(word.key)}-error`} message={rowError} />
            </div>}
          </SortableWordRow>
        })}
        </div>
        </SortableContext>
        </DndContext>
        <div className="space-y-3 pt-3 md:px-6 md:py-4">
          <Button variant="outline" className="w-full border-dashed text-muted-foreground" onClick={addWord}><Plus aria-hidden="true" />{t("addWord")}</Button>
          <p className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:flex">
            <Kbd>Enter</Kbd>{t("shortcutNext")}
            <span aria-hidden="true">・</span><Kbd>Alt+↑↓</Kbd>{t("shortcutMove")}
            <span aria-hidden="true">・</span><Kbd>Ctrl（⌘）+Enter</Kbd>{t("shortcutSave")}
            <span aria-hidden="true">・</span><GripVertical className="size-3.5" aria-hidden="true" />{t("shortcutDrag")}
          </p>
        </div>
      </section>
    </div>

    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.05)] backdrop-blur sm:bottom-4 sm:mx-0 sm:mb-4 sm:rounded-xl sm:border sm:px-5 sm:shadow-lg">
      {recount && initial && <p className="mb-2.5 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{t("recount", { from: initial.words.length, to: filled.length, records: ranked })}</span>
      </p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex-1 sm:basis-auto">
          {shown.length ? <>
            <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span role="alert" className="font-medium text-destructive">{t("errorCount", { count: shown.length })}</span>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => focusField(shown[0].id)}>{t("firstError")}</Button>
          </> : serverError ? <p role="alert" className="flex items-start gap-1.5 text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{serverError}
          </p> : dirty ? <>
            <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="font-medium">{t("unsaved")}</span>
          </> : <span className="text-muted-foreground">{t("noChanges")}</span>}
          <span className={shown.length || serverError ? "text-muted-foreground max-sm:hidden" : "text-muted-foreground"}>{t("wordTotal", { count: words.length })}</span>
        </div>
        <Button variant="ghost" onClick={cancel}>{form("cancel")}</Button>
        <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
          {saving ? form("saving") : t("save")}<span aria-hidden="true" className="hidden text-xs font-normal opacity-60 sm:inline">Ctrl+Enter</span>
        </Button>
      </div>
    </div>
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
