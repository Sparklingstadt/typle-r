import { useSyncExternalStore } from 'react'

// Matches Tailwind's `xl`, where the list and the detail sit side by side.
const WIDE = '(min-width: 80rem)'

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false)
}
