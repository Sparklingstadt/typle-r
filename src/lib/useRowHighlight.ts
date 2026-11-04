"use client"
import { useEffect, useState } from "react"

/** The id of the row to point at: it is scrolled into view and cleared after a moment. `paused` holds it while the rows are not shown. */
export function useRowHighlight(attribute: 'data-list-id' | 'data-pack-id', paused = false) {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    if (!id || paused) return
    document.querySelector(`[${attribute}="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
    const timer = window.setTimeout(() => setId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [id, paused, attribute])
  return [id, setId] as const
}
