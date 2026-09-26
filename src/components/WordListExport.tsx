"use client"
import { useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { encodeWordCsv, wordCsvFilename } from "@/lib/exportWords"
import type { SavedWordList } from "@/lib/wordLists"

export default function WordListExport({ list, disabled }: { list: SavedWordList; disabled?: boolean }) {
  const [error, setError] = useState("")
  return <div>
    <Button variant="outline" disabled={disabled} aria-label={`${list.name} をCSVエクスポート`} onClick={() => {
      setError("")
      let url: string | undefined
      const link = document.createElement("a")
      try {
        url = URL.createObjectURL(new Blob([encodeWordCsv(list.words)], { type: "text/csv;charset=utf-8" }))
        link.href = url
        link.download = wordCsvFilename(list.name)
        document.body.append(link)
        link.click()
      } catch { setError("エクスポートできませんでした。もう一度お試しください。") }
      finally {
        link.remove()
        // Give the browser time to start consuming the download before releasing it.
        if (url) { const downloadUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) }
      }
    }}><Download aria-hidden="true" />CSVエクスポート</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
