'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppError, type ErrorKey } from '@/core/appError'
import { GraphQLError, graphql } from '@/core/graphql'
import { useWordLists } from '@/lib/useWordLists'

/** `name` is the pack's name in the shared copy, "" when the copy has none. `hidden`: an administrator took it out of the gallery. */
export type Share = { id: string; name: string; listed: boolean; hidden: boolean; updatedAt: string }
type ShareResponse = { id: string; packId: string; name?: string; listed?: boolean; hidden?: boolean; updatedAt: string }

const SHARE = 'id packId name listed hidden updatedAt'

async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  try {
    return await graphql<T>(query, variables)
  } catch (reason) {
    if (!(reason instanceof GraphQLError)) throw reason
    if (reason.status === 401) throw new AppError('loginRequired')
    // The server names its error. Only those that make sense for a share are shown; the rest (such as a failed workspace
    // save, whose text speaks of keeping what was typed) fall back to the caller's text, see useErrorText.
    if (SHARE_ERRORS.has(reason.key)) throw new AppError(reason.key as ErrorKey)
    throw new Error(`Share request failed: ${reason.status}`)
  }
}

const SHARE_ERRORS = new Set<unknown>(['packNotFound', 'databaseUnavailable', 'forbiddenRequest', 'sharedPackHidden'] satisfies ErrorKey[])

const toShare = (item: ShareResponse): Share => ({ id: item.id, name: item.name ?? '', listed: !!item.listed, hidden: !!item.hidden, updatedAt: item.updatedAt })

// The account's shared packs, through `/api/graphql`. A guest has no account to share from, so nothing is asked and
// the list stays empty. A share is a copy made when it is created or updated, so saving a pack does not touch it.
// Saving the workspace ends the shares of packs it no longer has, so the list is read again whenever the packs change;
// shares of packs the account does not have (`orphans`, left by older versions) are only told apart on a list read for
// the packs shown now, so a pack that was just deleted never shows up there while its share is being ended.
export function useShares() {
  const { storage, accountId, packs, ready } = useWordLists()
  const enabled = storage === 'account'
  const packIds = useMemo(() => packs.map(pack => pack.id).sort().join('\n'), [packs])
  const [loaded, setLoaded] = useState<{ owner?: string; packIds?: string; shares: Map<string, Share> }>({ shares: new Map() })
  const current = enabled && loaded.owner === accountId
  const shares = current ? loaded.shares : EMPTY
  // Counts finished shares and stops, so a list read that was sent before one of them does not undo it.
  const changes = useRef(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!enabled || !ready) return
    let active = true
    const sent = changes.current
    request<{ shares?: unknown }>(`query Shares { shares { ${SHARE} } }`).then(data => {
      if (!active || !Array.isArray(data.shares)) return
      // Read again rather than lose a share or stop that finished while this read was on its way.
      if (sent !== changes.current) { setRetry(count => count + 1); return }
      setLoaded({ owner: accountId, packIds, shares: new Map((data.shares as ShareResponse[]).map(item => [item.packId, toShare(item)])) })
    }).catch(() => {})
    return () => { active = false }
  }, [enabled, ready, accountId, packIds, retry])

  const orphans = useMemo(() => {
    if (!current || !ready || loaded.packIds !== packIds) return NO_ORPHANS
    const known = new Set(packs.map(pack => pack.id))
    return [...shares].filter(([packId]) => !known.has(packId)).map(([packId, item]) => ({ ...item, packId }))
  }, [current, ready, loaded.packIds, packIds, packs, shares])

  const share = useCallback(async (packId: string, listed?: boolean): Promise<Share> => {
    // Without `listed` the server keeps the listing as it is.
    let response: ShareResponse | undefined
    try {
      response = (await request<{ sharePack?: ShareResponse }>(
        `mutation SharePack($packId: String!, $listed: Boolean) { sharePack(packId: $packId, listed: $listed) { ${SHARE} } }`,
        listed === undefined ? { packId } : { packId, listed })).sharePack
    } catch (reason) {
      // An administrator hid the share while the dialog was open: show it as hidden, not only the error.
      if (reason instanceof AppError && reason.key === 'sharedPackHidden') {
        changes.current++
        setLoaded(state => {
          const known = state.owner === accountId ? state.shares.get(packId) : undefined
          return known ? { ...state, shares: new Map(state.shares).set(packId, { ...known, hidden: true }) } : state
        })
      }
      throw reason
    }
    if (!response) throw new AppError('invalidServerData')
    const result = toShare(response)
    changes.current++
    setLoaded(state => state.owner === accountId
      ? { ...state, shares: new Map(state.shares).set(packId, result) }
      : { owner: accountId, shares: new Map([[packId, result]]) })
    return result
  }, [accountId])

  const stop = useCallback(async (packId: string) => {
    await request('mutation StopSharing($packId: String!) { stopSharing(packId: $packId) }', { packId })
    changes.current++
    setLoaded(state => {
      if (state.owner !== accountId) return { owner: accountId, shares: new Map() }
      const next = new Map(state.shares)
      next.delete(packId)
      return { ...state, shares: next }
    })
  }, [accountId])

  return useMemo(() => ({ enabled, shares, orphans, share, stop }), [enabled, shares, orphans, share, stop])
}

export type OrphanShare = Share & { packId: string }

const EMPTY = new Map<string, Share>()
const NO_ORPHANS: OrphanShare[] = []
