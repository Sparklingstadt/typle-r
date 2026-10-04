"use client"
import { csvFormat, wordFilename } from "@/plugins/formats"
import type { SavedWordList } from "@/core/wordLists"

/** Downloads the list's words as CSV. Returns false when the browser could not start the download. */
export function downloadWordCsv(list: SavedWordList) {
  let url: string | undefined
  const link = document.createElement("a")
  try {
    url = URL.createObjectURL(new Blob([csvFormat.encode(list.words)], { type: csvFormat.mimeType }))
    link.href = url
    link.download = wordFilename(list.name, csvFormat)
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
