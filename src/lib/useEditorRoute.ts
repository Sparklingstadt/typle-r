"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { SavedWordList } from "@/core/wordLists"

// `/edit?list=<id>` opens the editor, so other screens can link to it and the browser's back button returns to the lists.
// The editor stays open while it has unsaved changes: going back asks first, like キャンセル.
export function useEditorRoute(urlId: string | null) {
  const [openId, setOpenId] = useState(urlId)
  const [seenUrl, setSeenUrl] = useState(urlId)
  const [dirty, setDirty] = useState(false)
  const [cancelRequest, setCancelRequest] = useState(0)
  const pushed = useRef(false)
  const returnTo = useRef<{ id: string; scroll: number } | null>(null)

  // Follow the URL (back/forward, the sidebar link), unless that would drop unsaved changes.
  if (urlId !== seenUrl) {
    setSeenUrl(urlId)
    if (openId && urlId !== openId && dirty) setCancelRequest(count => count + 1)
    else setOpenId(urlId)
  }
  // Put the editor's URL back once per request, so the confirmation is answered on the editor.
  const restored = useRef(0)
  useEffect(() => {
    if (cancelRequest === restored.current) return
    restored.current = cancelRequest
    if (!openId || urlId === openId) return
    pushed.current = true
    window.history.pushState(null, '', `/edit?list=${encodeURIComponent(openId)}`)
  }, [cancelRequest, openId, urlId])

  // Back on the lists: where the editor was opened from, with the row that was changed in view.
  useEffect(() => {
    if (openId) return
    pushed.current = false
    const target = returnTo.current
    returnTo.current = null
    if (!target) return
    window.scrollTo({ top: target.scroll })
    document.querySelector<HTMLElement>(`[data-list-id="${CSS.escape(target.id)}"] [data-edit]`)?.focus({ preventScroll: true })
  }, [openId])

  function open(list: SavedWordList) {
    returnTo.current = { id: list.id, scroll: window.scrollY }
    pushed.current = true
    setDirty(false)
    setOpenId(list.id)
    window.history.pushState(null, '', `/edit?list=${encodeURIComponent(list.id)}`)
    window.scrollTo({ top: 0 })
  }

  function close() {
    const id = openId
    returnTo.current ??= id ? { id, scroll: 0 } : null
    setDirty(false)
    setOpenId(null)
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else window.history.replaceState(null, '', '/edit')
  }

  const trackDirty = useCallback((value: boolean) => setDirty(value), [])

  return { openId, cancelRequest, open, close, trackDirty }
}
