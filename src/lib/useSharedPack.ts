import { useEffect, useState } from 'react'
import { graphql } from '@/core/graphql'
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
    // The file comes as the JSON value it was stored as, and null once the link is stopped.
    graphql<{ sharedPack: unknown }>('query SharedPack($id: String!) { sharedPack(id: $id) }', { id }).then(({ sharedPack }) => {
      if (sharedPack === null) return show({ state: 'ended' })
      show({ state: 'ready', file: decodePackFile(JSON.stringify(sharedPack)) })
    }).catch(reason => show({ state: 'failed', reason }))
    return () => { active = false }
  }, [id])
  return shared
}
