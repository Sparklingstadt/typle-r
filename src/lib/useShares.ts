'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppError } from '@/core/appError'
import { useWordLists } from '@/lib/useWordLists'

export type Share = { id: string; updatedAt: string }
type ShareResponse = { id: string; packId: string; updatedAt: string }

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  if (response.status === 204) return null
  if (!response.ok) throw new AppError(response.status === 401 ? 'loginRequired' : 'workspaceRequestFailed')
  const data = await response.json().catch(() => null)
  if (!data) throw new AppError('invalidServerData')
  return data
}

// The account's shared packs, through `/api/shares`. A guest has no account to share from, so nothing is asked and
// the list stays empty. A share is a copy made when it is created or updated, so saving a pack does not touch it.
export function useShares() {
  const { storage, accountId } = useWordLists()
  const enabled = storage === 'account'
  const [loaded, setLoaded] = useState<{ owner?: string; shares: Map<string, Share> }>({ shares: new Map() })
  const shares = enabled && loaded.owner === accountId ? loaded.shares : EMPTY

  useEffect(() => {
    if (!enabled) return
    let current = true
    request('/api/shares').then(data => {
      if (!current || !Array.isArray(data?.shares)) return
      setLoaded({ owner: accountId, shares: new Map((data.shares as ShareResponse[]).map(item => [item.packId, { id: item.id, updatedAt: item.updatedAt }])) })
    }).catch(() => {})
    return () => { current = false }
  }, [enabled, accountId])

  const share = useCallback(async (packId: string): Promise<Share> => {
    const data = await request('/api/shares', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId }) }) as ShareResponse
    const result = { id: data.id, updatedAt: data.updatedAt }
    setLoaded(state => ({ owner: accountId, shares: new Map(state.owner === accountId ? state.shares : []).set(packId, result) }))
    return result
  }, [accountId])

  const stop = useCallback(async (packId: string) => {
    await request(`/api/shares?pack=${encodeURIComponent(packId)}`, { method: 'DELETE' })
    setLoaded(state => {
      const next = new Map(state.shares)
      next.delete(packId)
      return { owner: accountId, shares: next }
    })
  }, [accountId])

  return useMemo(() => ({ enabled, shares, share, stop }), [enabled, shares, share, stop])
}

const EMPTY = new Map<string, Share>()
