"use client"
import { useSyncExternalStore } from 'react'

// Editors with unsaved changes register here, so actions that remount the page (switching profiles) can wait for them.
let count = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Call from an effect while there are unsaved changes; the returned cleanup unregisters them. */
export function holdUnsavedChanges() {
  count++
  listeners.forEach(listener => listener())
  return () => {
    count--
    listeners.forEach(listener => listener())
  }
}

export function useHasUnsavedChanges() {
  return useSyncExternalStore(subscribe, () => count > 0, () => false)
}
