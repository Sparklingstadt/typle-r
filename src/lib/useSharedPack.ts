import { useEffect, useState } from 'react'
import { ApiError, api, withQuery } from '@/core/api'
import { decodePackFile, type PackFile } from '@/core/packFile'

type Shared =
  | { state: 'loading' }
  | { state: 'ended' }
  | { state: 'failed'; reason: unknown }
  | { state: 'ready'; file: PackFile }

// Loads the shared pack `id`, and again when `id` changes.
export function useSharedPack(id: string) {
  const [shared, setShared] = useState<Shared>({ state: 'loading' })
  useEffect(() => {
    let active = true
    const show = (next: Shared) => { if (active) setShared(next) }
    // The file comes as the JSON value it was stored as; a link that was stopped (or never was) is sharedPackNotFound.
    api(withQuery('/api/shared', { id })).then(file => {
      show({ state: 'ready', file: decodePackFile(JSON.stringify(file)) })
    }).catch(reason => {
      if (reason instanceof ApiError && reason.key === 'sharedPackNotFound') return show({ state: 'ended' })
      show({ state: 'failed', reason })
    })
    return () => { active = false }
  }, [id])
  return shared
}
