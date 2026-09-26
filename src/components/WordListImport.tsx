"use client"
import { useEffect, useId, useRef, useState } from "react"
import TextField from "./ui/TextField"
import { Alert, AlertDescription } from "./ui/alert"
import { MAX_IMPORT_BYTES, parseWordFile } from "../lib/importWords"
import type { WordList } from "../types/WordList"

export default function WordListImport({ onImport, disabled }: {
  onImport: (words: WordList["words"], name: string) => void
  disabled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const helpId = useId()
  const importRef = useRef(onImport)
  useEffect(() => { importRef.current = onImport }, [onImport])
  return <section className="space-y-3 rounded-lg border p-4" aria-label="ファイルから単語を追加">
    <TextField label="CSV・TSVファイルから追加" type="file" accept=".csv,.tsv" disabled={disabled || busy}
      aria-describedby={helpId} onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (!file) return
        setBusy(true); setError(""); setMessage("")
        try {
          const extension = file.name.split(".").pop()?.toLowerCase()
          if (extension !== "csv" && extension !== "tsv") throw new Error("CSVまたはTSVファイルを選択してください。")
          if (file.size > MAX_IMPORT_BYTES) throw new Error("ファイルは1 MiB以内にしてください。")
          let text: string
          try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()) }
          catch { throw new Error("UTF-8形式で保存したファイルを選択してください。") }
          const words = parseWordFile(text, extension === "tsv" ? "\t" : ",")
          importRef.current(words, file.name.replace(/\.(csv|tsv)$/i, "").slice(0, 200))
          setMessage(`${words.length}件を追加しました。下の内容を確認して「保存」を押してください。`)
        } catch (cause) { setError(cause instanceof Error ? cause.message : "ファイルを読み込めませんでした。") }
        finally { setBusy(false) }
      }} />
    <p id={helpId} className="text-sm text-muted-foreground">1行目は input、display（必須）、annotation（省略可）。列の順番は自由です。UTF-8、1 MiB以内、1リスト1,000件まで。入力中の単語の末尾に追加します。</p>
    <p role="status" className="text-sm">{busy ? "読み込み中…" : message}</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </section>
}
