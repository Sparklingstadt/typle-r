"use client"
import { randomId } from "../lib/randomId"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { flushSync } from "react-dom"
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import TextField from "@/components/ui/TextField"
import WordListImport from "./WordListImport"
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import SortableWordRow from "./SortableWordRow"
import type { SavedWordList } from "@/lib/wordLists"

const emptyWord = () => ({ display: "", input: "", annotation: "" })
const snapshot = (name: string, words: SavedWordList["words"]) =>
  JSON.stringify([name, words.map(word => [word.display, word.input, word.annotation])])
const displayId = (key: string) => `word-display-${key}`

export default function WordListEditor({ initial, error, onSave, onCancel }: {
  initial?: SavedWordList
  error?: string
  onSave: (list: SavedWordList) => Promise<boolean>
  onCancel: () => void
}) {
  const dragId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [name, setName] = useState(initial?.name ?? "")
  const [words, setWords] = useState(() => (initial?.words ?? [emptyWord()]).map((word, index) => ({ ...word, key: `initial-${index}` })))
  const [initialSnapshot] = useState(() => snapshot(initial?.name ?? "", initial?.words ?? [emptyWord()]))
  const dirty = snapshot(name, words) !== initialSnapshot

  const draftId = useRef<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [expandedAnnotations, setExpandedAnnotations] = useState<Set<string>>(() => new Set())
  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(() => new Set())
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  // Save errors are rendered next to the actions; bring them into view after each failed save.
  const [failedSaves, setFailedSaves] = useState(0)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (failedSaves) errorRef.current?.scrollIntoView({ block: "nearest" })
  }, [failedSaves])

  // Enter moves to the next word instead of submitting; the last filled word gets a new row.
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return
    const target = event.target
    if (!(target instanceof HTMLInputElement) || target.type === "file") return
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      event.currentTarget.requestSubmit()
      return
    }
    if (saving) return
    const index = words.findIndex(word => word.key === target.dataset.wordKey)
    if (index < words.length - 1) {
      document.getElementById(displayId(words[index + 1].key))?.focus()
      return
    }
    if (!words[index]?.display) return
    const key = randomId()
    flushSync(() => setWords(current => [...current, { ...emptyWord(), key }]))
    document.getElementById(displayId(key))?.focus()
  }

  function move(index: number, offset: number) {
    setWords(current => {
      const next = [...current]
      const target = index + offset
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return <form onKeyDown={handleKeyDown} onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    draftId.current ??= initial?.id ?? randomId()
    setSaving(true)
    try {
      const saved = await onSave({ id: draftId.current, name, words: words.map(({ key, ...word }) => ({ ...word, input: word.input || word.display })),
        records: initial?.records ?? [], createdAt: initial?.createdAt ?? new Date().toISOString() })
      if (!saved) setFailedSaves(count => count + 1)
    } finally { setSaving(false) }
  }} className="space-y-6">
    <WordListImport disabled={saving} onImport={(imported, filename) => {
      const current = words.length === 1 && !words[0].input && !words[0].display && !words[0].annotation ? [] : words
      if (current.length + imported.length > 1000) throw new Error("単語は1リストにつき1,000件までです。")
      const added = imported.map(word => ({ ...word, key: randomId() }))
      setWords([...current, ...added])
      setName(value => value.trim() ? value : filename)
      setExpandedInputs(value => new Set([...value, ...added.map(word => word.key)]))
      setExpandedAnnotations(value => new Set([...value, ...added.filter(word => word.annotation).map(word => word.key)]))
    }} />
    <TextField label="単語リスト名" required value={name} onChange={event => setName(event.target.value)} />
    <p>表示する単語と、正解として入力する文字を指定します。未ログイン時はこのブラウザーに、ログイン時はアカウントに保存されます。</p>
    <p className="text-sm text-muted-foreground">Enterキーで次の単語へ移動し、最後の単語では新しい行を追加します。Ctrl（Macは⌘）+Enterで保存します。順番の横のハンドルをドラッグして並べ替えられます。キーボードではハンドルでスペースキー、上下矢印キー、スペースキーの順に操作します。</p>
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
    <Table aria-label="単語の追加・編集" className="block w-full md:table md:table-fixed">
      <TableHeader className="sr-only md:not-sr-only md:table-header-group"><TableRow>
        <TableHead scope="col" className="w-24">順番</TableHead>
        <TableHead scope="col">単語</TableHead>
        <TableHead scope="col">入力・補足</TableHead>
        <TableHead scope="col" className="w-32">操作</TableHead>
      </TableRow></TableHeader>
      <TableBody className="block md:table-row-group">
    {words.map((word, index) => <SortableWordRow key={word.key} id={word.key} index={index} disabled={saving || words.length < 2}>
      <TableCell className="min-w-0 whitespace-normal">
      <TextField id={displayId(word.key)} data-word-key={word.key} label={`表示する単語 ${index + 1}`} hideLabel placeholder="単語を入力" required value={word.display}
        onChange={event => setWords(current => current.map(item => item.key === word.key ? {
          ...item, display: event.target.value,
          input: item.input === item.display ? event.target.value : item.input,
        } : item))} />
      </TableCell>
      <TableCell className="col-start-2 min-w-0 whitespace-normal break-words space-y-3">
      <ButtonGroup aria-label={`単語 ${index + 1} の入力・補足設定`}>
      <Button variant="outline" aria-expanded={expandedInputs.has(word.key)}
        aria-controls={`input-${word.key}`} onClick={() => setExpandedInputs(current => {
          const next = new Set(current)
          if (next.has(word.key)) next.delete(word.key)
          else next.add(word.key)
          return next
        })}>入力</Button>
      <Button variant="outline" aria-expanded={expandedAnnotations.has(word.key)}
        aria-controls={`annotation-${word.key}`} onClick={() => setExpandedAnnotations(current => {
          const next = new Set(current)
          if (next.has(word.key)) next.delete(word.key)
          else next.add(word.key)
          return next
        })}>補足</Button>
      </ButtonGroup>
      <div id={`input-${word.key}`} hidden={!expandedInputs.has(word.key)}>
        <TextField data-word-key={word.key} label={`入力する文字 ${index + 1}`} hideLabel value={word.input} placeholder={word.display || '入力する文字'}
          onChange={event => setWords(current => current.map(item => item.key === word.key ? { ...item, input: event.target.value } : item))} />
        <p className="mt-2 text-sm text-muted-foreground">空欄の場合は表示する単語と同じ文字を使います。</p>
      </div>
      <div id={`annotation-${word.key}`} hidden={!expandedAnnotations.has(word.key)}>
        <TextField data-word-key={word.key} label={`補足 ${index + 1}`} hideLabel placeholder="補足を入力" value={word.annotation}
          onChange={event => setWords(current => current.map(item => item.key === word.key ? { ...item, annotation: event.target.value } : item))} />
      </div>
      </TableCell>
      <TableCell className="col-start-2 min-w-0">
      <ButtonGroup aria-label={`単語 ${index + 1} の操作`}>
        <Button size="icon-lg" variant="outline" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`単語 ${index + 1} を上へ`} title="上へ"><ArrowUp className="size-5" aria-hidden="true" /></Button>
        <Button size="icon-lg" variant="outline" disabled={index === words.length - 1} onClick={() => move(index, 1)} aria-label={`単語 ${index + 1} を下へ`} title="下へ"><ArrowDown className="size-5" aria-hidden="true" /></Button>
        <Button size="icon-lg" variant="outline" className="text-destructive hover:text-destructive" disabled={words.length === 1} onClick={() => setWords(current => current.filter(item => item.key !== word.key))} aria-label={`単語 ${index + 1} を削除`} title="削除"><Trash2 className="size-5" aria-hidden="true" /></Button>
      </ButtonGroup>
      </TableCell>
    </SortableWordRow>)}
      </TableBody>
    </Table>
    </SortableContext>
    </DndContext>
    <Button onClick={() => setWords(current => [...current, { ...emptyWord(), key: randomId() }])}>単語を追加</Button>
    {error && <Alert ref={errorRef} variant="destructive" className="scroll-my-6"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex gap-3">
      <Button type="submit" disabled={saving} variant="default">{saving ? "保存中…" : "保存"}</Button>
      <Button onClick={() => dirty ? setConfirmingCancel(true) : onCancel()}>キャンセル</Button>
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
