"use client"
import { encodeWordCsv, wordCsvFilename } from "@/lib/exportWords"
import type { SavedWordList } from "@/lib/wordLists"

/** Downloads the list's words as CSV. Returns false when the browser could not start the download. */
export function downloadWordCsv(list: SavedWordList) {
  let url: string | undefined
  const link = document.createElement("a")
  try {
    url = URL.createObjectURL(new Blob([encodeWordCsv(list.words)], { type: "text/csv;charset=utf-8" }))
    link.href = url
    link.download = wordCsvFilename(list.name)
    document.body.append(link)
    link.click()
    return true
  } catch { return false }
  finally {
    link.remove()
    // Give the browser time to start consuming the download before releasing it.
    if (url) { const downloadUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000) }
  }
}
