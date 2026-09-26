"use client"
import { randomId } from "../lib/randomId"
import { useRef, useState } from "react"
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import TextField from "@/components/ui/TextField"
import WordListImport from "./WordListImport"
import type { SavedWordList } from "@/lib/wordLists"

export default function WordListEditor({ initial, onSave, onCancel }: {
  initial?: SavedWordList
  onSave: (list: SavedWordList) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [words, setWords] = useState(() => (initial?.words ?? [{ display: "", input: "", annotation: "" }]).map((word, index) => ({ ...word, key: `initial-${index}` })))

  const draftId = useRef<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [expandedAnnotations, setExpandedAnnotations] = useState<Set<string>>(() => new Set())
  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(() => new Set())

  function move(index: number, offset: number) {
    setWords(current => {
      const next = [...current]
      const target = index + offset
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return <form onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    draftId.current ??= initial?.id ?? randomId()
    setSaving(true)
    try { await onSave({ id: draftId.current, name, words: words.map(({ key, ...word }) => ({ ...word, input: word.input || word.display })),
      records: initial?.records ?? [], createdAt: initial?.createdAt ?? new Date().toISOString() }) } finally { setSaving(false) }
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
    <p>表示する単語と、正解として入力する文字を指定します。ログイン中のアカウントに保存されます。</p>
    <Table aria-label="単語の追加・編集" className="block w-full md:table md:table-fixed">
      <TableHeader className="sr-only md:not-sr-only md:table-header-group"><TableRow>
        <TableHead scope="col" className="w-12">順番</TableHead>
        <TableHead scope="col">単語</TableHead>
        <TableHead scope="col">入力・補足</TableHead>
        <TableHead scope="col" className="w-32">操作</TableHead>
      </TableRow></TableHeader>
      <TableBody className="block md:table-row-group">
    {words.map((word, index) => <TableRow key={word.key} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start py-2 md:table-row md:py-0 align-top">
      <TableHead scope="row" className="pt-4">{index + 1}</TableHead>
      <TableCell className="min-w-0 whitespace-normal">
      <TextField label={`表示する単語 ${index + 1}`} hideLabel placeholder="単語を入力" required value={word.display}
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
        <TextField label={`入力する文字 ${index + 1}`} hideLabel value={word.input} placeholder={word.display || '入力する文字'}
          onChange={event => setWords(current => current.map(item => item.key === word.key ? { ...item, input: event.target.value } : item))} />
        <p className="mt-2 text-sm text-muted-foreground">空欄の場合は表示する単語と同じ文字を使います。</p>
      </div>
      <div id={`annotation-${word.key}`} hidden={!expandedAnnotations.has(word.key)}>
        <TextField label={`補足 ${index + 1}`} hideLabel placeholder="補足を入力" value={word.annotation}
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
    </TableRow>)}
      </TableBody>
    </Table>
    <Button onClick={() => setWords(current => [...current, { key: randomId(), display: "", input: "", annotation: "" }])}>単語を追加</Button>
    <div className="flex gap-3">
      <Button type="submit" disabled={saving} variant="default">{saving ? "保存中…" : "保存"}</Button>
      <Button onClick={onCancel}>キャンセル</Button>
    </div>
  </form>
}
