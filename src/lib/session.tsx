"use client"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type SessionUser = { id: string; name: string; image: string | null }
type SessionData = { user: SessionUser } | null
type SessionState = {
  data: SessionData
  status: 'loading' | 'authenticated' | 'unauthenticated'
  update: () => Promise<void>
}

const SessionContext = createContext<SessionState>({ data: null, status: 'loading', update: async () => {} })

/** Reads the signed-in user from the Go backend. A failed request is treated as signed out. */
async function fetchSession(): Promise<SessionData> {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' })
    if (!response.ok) return null
    const body = await response.json() as { user?: SessionUser | null }
    return body.user ? { user: body.user } : null
  } catch { return null }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SessionData>(null)
  const [loaded, setLoaded] = useState(false)
  const mounted = useRef(true)
  const refresh = useCallback(async () => {
    const next = await fetchSession()
    if (!mounted.current) return
    setData(next)
    setLoaded(true)
  }, [])
  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => { mounted.current = false }
  }, [refresh])
  const value = useMemo<SessionState>(() => ({
    data,
    status: !loaded ? 'loading' : data ? 'authenticated' : 'unauthenticated',
    update: refresh,
  }), [data, loaded, refresh])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}

/** Goes to GitHub and comes back to the page being viewed. */
export function signIn(): void {
  // A full navigation: the sign-in route is served by the Go backend, not by the Next.js router.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign('/api/auth/signin?returnTo=' + encodeURIComponent(location.pathname + location.search))
}

export async function signOut(): Promise<void> {
  try { await fetch('/api/auth/signout', { method: 'POST' }) } finally {
    // A full page load, so nothing from the signed-in session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.assign('/home')
  }
}
