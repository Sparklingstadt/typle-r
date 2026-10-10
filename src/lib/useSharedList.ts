"use client"
import { useEffect, useState } from 'react'
import { AppError } from '../core/appError'
import type { SharedList } from '../core/sharedLists'
import { readSharedList } from '../plugins/storage/cloud/client'

type Loaded = { id: string; list: SharedList | null; error: AppError | null }

/** The list behind a share link; screens use this rather than the storage plugin. */
export function useSharedList(id: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => {
    let active = true
    readSharedList(id).then(
      list => { if (active) setLoaded({ id, list, error: null }) },
      reason => { if (active) setLoaded({ id, list: null, error: reason instanceof AppError ? reason : new AppError('workspaceRequestFailed') }) })
    return () => { active = false }
  }, [id])
  const current = loaded?.id === id ? loaded : null
  return { list: current?.list ?? null, error: current?.error ?? null, loading: !current }
}
