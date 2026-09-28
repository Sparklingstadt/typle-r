"use client"
import { useId, useRef, useState, type DragEvent } from "react"
import { FileSpreadsheet, Upload, X } from "lucide-react"
import { Alert, AlertDescription } from "./ui/alert"
import { Button } from "./ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { MAX_IMPORT_BYTES, parseWordFile } from "../lib/importWords"
import type { WordList } from "../types/WordList"

type Words = WordList["words"]
export type ImportMode = "append" | "replace"
type Parsed = { name: string; size: number; words: Words }

async function readWordFile(file: File): Promise<Parsed> {
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension !== "csv" && extension !== "tsv") throw new Error("CSVまたはTSVファイルを選択してください。")
  if (file.size > MAX_IMPORT_BYTES) throw new Error("ファイルは1 MiB以内にしてください。")
  let text: string
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()) }
  catch { throw new Error("UTF-8形式で保存したファイルを選択してください。") }
  return { name: file.name, size: file.size, words: parseWordFile(text, extension === "tsv" ? "\t" : ",") }
}

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`

export default function WordListImport({ onImport, disabled, existingCount }: {
  /** Throws to keep the dialog open with the message shown. */
  onImport: (words: Words, name: string, mode: ImportMode) => void
  disabled: boolean
  /** Words already entered, not counting empty rows. */
  existingCount: number
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [mode, setMode] = useState<ImportMode>("append")
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const helpId = useId()

  function reset() { setError(""); setParsed(null); setMode("append"); setDragging(false) }

  async function load(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(""); setParsed(null)
    try { setParsed(await readWordFile(file)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "ファイルを読み込めませんでした。") }
    finally { setBusy(false) }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (!busy) void load(event.dataTransfer.files[0])
  }

  function confirm() {
    if (!parsed) return
    try {
      onImport(parsed.words, parsed.name.replace(/\.(csv|tsv)$/i, "").slice(0, 200), existingCount ? mode : "append")
      setOpen(false)
      reset()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "単語を追加できませんでした。") }
  }

  const count = parsed?.words.length ?? 0
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) reset() }}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" disabled={disabled}><Upload aria-hidden="true" />CSV・TSVを読み込む</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>CSV・TSVから読み込む</DialogTitle>
        <DialogDescription id={helpId}>1行目は列名です。display は必須、input・annotation は省略できます。列の順番は自由です。</DialogDescription>
      </DialogHeader>
      <input ref={inputRef} type="file" accept=".csv,.tsv" className="sr-only" tabIndex={-1} aria-label="CSV・TSVファイルを選択"
        aria-describedby={helpId} disabled={busy} onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ""
          void load(file)
        }} />
      {parsed ? <>
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{parsed.name}</p>
            <p className="text-xs text-muted-foreground">{count.toLocaleString()}語 ・ {formatSize(parsed.size)}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="別のファイルを選ぶ" title="別のファイルを選ぶ" onClick={reset}><X aria-hidden="true" /></Button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-left text-sm" aria-label="読み込む単語のプレビュー">
            <thead className="bg-muted text-xs text-muted-foreground"><tr>
              <th scope="col" className="px-3 py-2 font-medium">表示する単語</th>
              <th scope="col" className="px-3 py-2 font-medium">入力する文字</th>
              <th scope="col" className="px-3 py-2 font-medium">補足</th>
            </tr></thead>
            <tbody>{parsed.words.slice(0, 3).map((word, index) => <tr key={index} className="border-t">
              <td className="truncate px-3 py-2">{word.display}</td>
              <td className="truncate px-3 py-2">{word.input}</td>
              <td className="truncate px-3 py-2 text-muted-foreground">{word.annotation || "—"}</td>
            </tr>)}</tbody>
          </table>
          {count > 3 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">ほか{(count - 3).toLocaleString()}語</p>}
        </div>
        {existingCount > 0 && <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">入力済みの単語の扱い</legend>
          {([["append", "今の単語の末尾に追加", `入力済みの${existingCount}語のあとに${count}語を追加します。`],
            ["replace", "今の単語を置き換える", `入力済みの${existingCount}語は削除されます。`]] as const).map(([value, label, hint]) =>
            <label key={value} className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="import-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 size-4 accent-primary" />
              <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
            </label>)}
        </fieldset>}
      </> : <>
        <div onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={drop}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${dragging ? "border-ring bg-muted" : "bg-muted/40"}`}>
          <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">ファイルをここにドロップ</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>ファイルを選択</Button>
          <p className="text-xs text-muted-foreground">CSV / TSV・UTF-8・1 MiB以内・1リスト1,000語まで</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">書式の例</p>
          <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs leading-5">{"display,input,annotation\n日本,nihon,にほん\nアメリカ,amerika,"}</pre>
        </div>
      </>}
      <p role="status" className="sr-only">{busy ? "読み込み中…" : parsed ? `${count}語を読み込みました。` : ""}</p>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <DialogFooter>
        <DialogClose asChild><Button variant="ghost">キャンセル</Button></DialogClose>
        {parsed && <Button onClick={confirm}>{existingCount && mode === "replace" ? `${count}語で置き換える` : `${count}語を追加`}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
