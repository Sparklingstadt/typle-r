"use client"
import { randomId } from "../lib/randomId"
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, ChevronLeft, CircleAlert, GripVertical, HardDrive, Info, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import WordListImport from "./WordListImport"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import SortableWordRow, { WORD_ROW_COLUMNS } from "./SortableWordRow"
import { DUPLICATE_NAME_ERROR, type SavedWordList } from "@/lib/wordLists"
import { currentRecordCount } from "@/lib/listOverview"
import { holdUnsavedChanges } from "@/lib/unsavedChanges"

type Word = SavedWordList["words"][number]
const MAX_WORDS = 1000
const emptyWord = (): Word => ({ display: "", input: "", annotation: "" })
// An input equal to the display is shown as empty; saving uses the display for empty inputs.
const normalize = (word: Word): Word => ({ ...word, input: word.input === word.display ? "" : word.input })
const snapshot = (name: string, words: Word[]) =>
  JSON.stringify([name, words.map(word => [word.display, word.input, word.annotation])])
const isFilled = (word: Word) => !!(word.display || word.input || word.annotation)
const menuItem = "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4"

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border bg-background px-1.5 py-px font-sans text-[11px] font-medium text-foreground/70">{children}</kbd>
}

function FieldError({ id, message, alert }: { id: string; message: string; alert?: boolean }) {
  return <p id={id} role={alert ? "alert" : undefined} className="flex items-start gap-1.5 text-sm text-destructive">
    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}
  </p>
}

export default function WordListEditor({ title, description = "タイピングで表示する単語と、正解として入力する文字を登録します。", storage, initial, error, onSave, onCancel, onDirtyChange, cancelRequest = 0 }: {
  title: string
  description?: ReactNode
  storage?: "browser" | "account"
  initial?: SavedWordList
  error?: string
  onSave: (list: SavedWordList) => Promise<boolean>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
  /** Increment to leave the editor as if キャンセル was pressed: unsaved changes are confirmed first. */
  cancelRequest?: number
}) {
  const baseId = useId()
  const nameId = `${baseId}-name`
  const displayId = (key: string) => `${baseId}-display-${key}`
  const inputId = (key: string) => `${baseId}-input-${key}`
  const dragId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [name, setName] = useState(initial?.name ?? "")
  const [words, setWords] = useState(() => (initial?.words ?? [emptyWord()]).map((word, index) => ({ ...normalize(word), key: `initial-${index}` })))
  const [initialSnapshot] = useState(() => snapshot(initial?.name ?? "", (initial?.words ?? [emptyWord()]).map(normalize)))
  const dirty = snapshot(name, words) !== initialSnapshot

  const draftId = useRef<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [notice, setNotice] = useState("")
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  // Closing or reloading the tab would lose the changes; the browser asks first, and profiles cannot be switched.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    const release = holdUnsavedChanges()
    return () => {
      window.removeEventListener("beforeunload", warn)
      release()
    }
  }, [dirty])

  // Errors appear after the first save attempt and then follow the user's edits.
  const problems: { id: string; message: string }[] = []
  if (!name.trim()) problems.push({ id: nameId, message: "単語リスト名を入力してください。" })
  for (const word of words) {
    if (!word.display.trim()) problems.push({ id: displayId(word.key), message: "表示する単語を入力するか、この行を削除してください（空の行は保存できません）。" })
    else if (word.input && !word.input.trim()) problems.push({ id: inputId(word.key), message: "入力する文字が空白だけです。空欄にすると表示する単語と同じになります。" })
  }
  const shown = submitted ? problems : []
  const errorFor = (id: string) => shown.find(problem => problem.id === id)?.message

  // The duplicate-name check runs while saving; show it on the name field until the name changes.
  const [failure, setFailure] = useState<{ count: number; name: string }>({ count: 0, name: "" })
  const duplicate = error === DUPLICATE_NAME_ERROR && failure.name === name
  const serverError = error && error !== DUPLICATE_NAME_ERROR ? error : ""
  const nameError = errorFor(nameId) ?? (duplicate ? error : undefined)
  const handledFailure = useRef(0)
  useEffect(() => {
    if (failure.count <= handledFailure.current) return
    handledFailure.current = failure.count
    if (error === DUPLICATE_NAME_ERROR) document.getElementById(nameId)?.focus()
  }, [failure, error, nameId])

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
      const saved = await onSave({ id: draftId.current, name, words: words.map(({ key, ...word }) => ({ ...word, input: word.input || word.display })),
        records: initial?.records ?? [], createdAt: initial?.createdAt ?? new Date().toISOString() })
      if (!saved) setFailure(current => ({ count: current.count + 1, name }))
    } finally { setSaving(false) }
  }}>
    <Button variant="ghost" size="lg" className="-ml-2.5 mb-2 text-muted-foreground" onClick={cancel}><ChevronLeft aria-hidden="true" />単語リスト</Button>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {storage && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
        title={storage === "browser" ? "未ログインのため、このブラウザーのLocalStorageに保存します。" : "ログイン中のアカウントに保存します。"}>
        <HardDrive className="size-3.5" aria-hidden="true" />{storage === "browser" ? "このブラウザーに保存" : "アカウントに保存"}
      </span>}
    </header>

    <div className="space-y-6">
      <section className="space-y-2 rounded-xl border bg-card p-4 sm:p-6" aria-label="基本情報">
        <Label htmlFor={nameId}>単語リスト名<span aria-hidden="true" className="text-destructive">*</span></Label>
        <Input id={nameId} value={name} onChange={event => setName(event.target.value)} required aria-required="true"
          aria-invalid={nameError ? true : undefined} aria-describedby={`${nameId}-help${nameError ? ` ${nameId}-error` : ""}`} className="h-11" />
        {nameError ? <FieldError id={`${nameId}-error`} message={nameError} alert={duplicate && !errorFor(nameId)} />
          : null}
        <p id={`${nameId}-help`} className="text-xs text-muted-foreground">練習画面と単語リスト一覧に表示されます。</p>
      </section>

      <section aria-labelledby={`${baseId}-words`} className="md:overflow-hidden md:rounded-xl md:border md:bg-card">
        <div className="flex flex-wrap items-center gap-2 pb-3 md:px-6 md:py-4">
          <h2 id={`${baseId}-words`} className="text-base font-bold">単語</h2>
          <Badge variant="secondary" className="tabular-nums">{words.length.toLocaleString()} / {MAX_WORDS.toLocaleString()}</Badge>
          <div className="ml-auto">
            <WordListImport disabled={saving} existingCount={filled.length} onImport={(imported, filename, mode) => {
              const current = mode === "replace" ? [] : filled
              if (current.length + imported.length > MAX_WORDS) throw new Error("単語は1リストにつき1,000件までです。")
              setWords([...current, ...imported.map(word => ({ ...normalize(word), key: randomId() }))])
              setName(value => value.trim() ? value : filename)
              setNotice(`${imported.length}語を${current.length ? "追加しました" : "読み込みました"}。内容を確認して「保存」を押してください。`)
            }} />
          </div>
          <p role="status" className="basis-full text-sm text-muted-foreground empty:hidden">{notice}</p>
        </div>
        <div aria-hidden="true" className={`hidden md:grid ${WORD_ROW_COLUMNS} border-y bg-muted px-6 py-2 text-xs font-medium text-muted-foreground`}>
          <span>#</span>
          <span>表示する単語<span className="text-destructive">*</span></span>
          <span>入力する文字 <span className="font-normal">空欄なら表示と同じ</span></span>
          <span>補足（任意）</span>
          <span />
        </div>
        <DndContext id={dragId} sensors={sensors} collisionDetection={closestCenter}
          accessibility={{ screenReaderInstructions: { draggable: "スペースキーで単語を持ち上げ、上下矢印キーで移動し、スペースキーで確定します。Escapeキーでキャンセルします。" } }}
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
              <Input id={displayId(word.key)} data-word-key={word.key} aria-label={`表示する単語 ${n}`} placeholder="単語を入力" value={word.display}
                required aria-required="true" aria-invalid={displayError ? true : undefined} aria-describedby={rowError ? `${displayId(word.key)}-error` : undefined}
                className="h-10" onChange={event => update(word.key, { display: event.target.value })} />
            </div>
            <div className="col-span-3 row-start-3 grid grid-cols-2 gap-2 md:contents">
              <div className="space-y-1 md:col-start-3 md:row-start-1 md:space-y-0">
                <Label htmlFor={inputId(word.key)} className="text-xs text-muted-foreground md:sr-only">入力する文字</Label>
                <Input id={inputId(word.key)} data-word-key={word.key} aria-label={`入力する文字 ${n}`} placeholder={word.display} value={word.input}
                  aria-invalid={inputError ? true : undefined} aria-describedby={inputError ? `${displayId(word.key)}-error` : undefined}
                  className="h-10" onChange={event => update(word.key, { input: event.target.value })} />
              </div>
              <div className="space-y-1 md:col-start-4 md:row-start-1 md:space-y-0">
                <Label htmlFor={`${baseId}-annotation-${word.key}`} className="text-xs text-muted-foreground md:sr-only">補足</Label>
                <Input id={`${baseId}-annotation-${word.key}`} data-word-key={word.key} aria-label={`補足 ${n}`} placeholder="読み・意味など" value={word.annotation}
                  className="h-10" onChange={event => update(word.key, { annotation: event.target.value })} />
              </div>
            </div>
            <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 md:col-start-5">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`単語 ${n} の操作`} title="操作"><MoreHorizontal aria-hidden="true" /></Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                    <DropdownMenu.Item className={menuItem} disabled={index === 0} aria-keyshortcuts="Alt+ArrowUp" onSelect={() => moveTo(index, index - 1)}>
                      <ArrowUp aria-hidden="true" />上へ移動<span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">Alt+↑</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} disabled={index === words.length - 1} aria-keyshortcuts="Alt+ArrowDown" onSelect={() => moveTo(index, index + 1)}>
                      <ArrowDown aria-hidden="true" />下へ移動<span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">Alt+↓</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} disabled={index === 0} onSelect={() => moveTo(index, 0)}>
                      <ArrowUpToLine aria-hidden="true" />先頭へ移動
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} disabled={index === words.length - 1} onSelect={() => moveTo(index, words.length - 1)}>
                      <ArrowDownToLine aria-hidden="true" />末尾へ移動
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item className={`${menuItem} text-destructive data-[highlighted]:text-destructive`} disabled={words.length < 2} onSelect={() => remove(index)}>
                      <Trash2 aria-hidden="true" />この単語を削除
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <span className="hidden md:inline-flex">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={words.length < 2}
                  onClick={() => remove(index)} aria-label={`単語 ${n} を削除`} title="削除"><Trash2 aria-hidden="true" /></Button>
              </span>
            </div>
            {rowError && <div className="col-span-3 row-start-4 md:col-span-3 md:col-start-2 md:row-start-2">
              <FieldError id={`${displayId(word.key)}-error`} message={rowError} />
            </div>}
          </SortableWordRow>
        })}
        </div>
        </SortableContext>
        </DndContext>
        <div className="space-y-3 pt-3 md:px-6 md:py-4">
          <Button variant="outline" className="w-full border-dashed text-muted-foreground" onClick={addWord}><Plus aria-hidden="true" />単語を追加</Button>
          <p className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:flex">
            <Kbd>Enter</Kbd>次の単語へ（最後の単語では行を追加）
            <span aria-hidden="true">・</span><Kbd>Alt+↑↓</Kbd>単語を移動
            <span aria-hidden="true">・</span><Kbd>Ctrl（⌘）+Enter</Kbd>保存
            <span aria-hidden="true">・</span><GripVertical className="size-3.5" aria-hidden="true" />ドラッグで並べ替え
          </p>
        </div>
      </section>
    </div>

    <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.05)] backdrop-blur sm:bottom-4 sm:mx-0 sm:mb-4 sm:rounded-xl sm:border sm:px-5 sm:shadow-lg">
      {recount && initial && <p className="mb-2.5 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>単語数が{initial.words.length.toLocaleString()}語から{filled.length.toLocaleString()}語に変わります。{initial.words.length.toLocaleString()}語で練習した記録（{ranked}件）は残りますが、ベスト記録の順位には含まれなくなります。</span>
      </p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex-1 sm:basis-auto">
          {shown.length ? <>
            <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span role="alert" className="font-medium text-destructive">{shown.length}件のエラーがあります</span>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => focusField(shown[0].id)}>最初のエラーへ移動</Button>
          </> : serverError ? <p role="alert" className="flex items-start gap-1.5 text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{serverError}
          </p> : dirty ? <>
            <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="font-medium">未保存の変更があります</span>
          </> : <span className="text-muted-foreground">変更はありません</span>}
          <span className={shown.length || serverError ? "text-muted-foreground max-sm:hidden" : "text-muted-foreground"}>・ {words.length.toLocaleString()}語</span>
        </div>
        <Button variant="ghost" onClick={cancel}>キャンセル</Button>
        <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
          {saving ? "保存中…" : "保存"}<span aria-hidden="true" className="hidden text-xs font-normal opacity-60 sm:inline">Ctrl+Enter</span>
        </Button>
      </div>
    </div>
    <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>保存していない変更があります</AlertDialogTitle>
          <AlertDialogDescription>このまま戻ると、入力した内容は失われます。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>編集を続ける</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onCancel}>破棄して戻る</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </form>
}
