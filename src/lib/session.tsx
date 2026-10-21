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
  const latest = useRef(0)
  const inflight = useRef<Promise<void> | null>(null)
  // A forced read (update) always starts a new request. Only the newest request started is applied, so an older one that
  // resolves late cannot overwrite a fresher result. A read that is not forced joins the one already under way.
  const load = useCallback((force: boolean): Promise<void> => {
    if (!force && inflight.current) return inflight.current
    const id = ++latest.current
    const request: Promise<void> = fetchSession().then(next => {
      if (inflight.current === request) inflight.current = null
      if (!mounted.current || id !== latest.current) return
      // The same user keeps the same object, so a refresh on focus renders nothing again.
      setData(prev => prev?.user.id === next?.user.id && prev?.user.name === next?.user.name && prev?.user.image === next?.user.image ? prev : next)
      setLoaded(true)
    })
    inflight.current = request
    return request
  }, [])
  const refresh = useCallback(() => load(true), [load])
  useEffect(() => {
    mounted.current = true
    void load(false)
    // Another tab may have signed in or out, or switched account: look again whenever this one comes back into view.
    const again = () => { if (document.visibilityState === 'visible') void load(false) }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [load])
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

/** Signs out and goes home. Rejects, and stays on the page signed in, when the sign-out request fails or is refused. */
export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/signout', { method: 'POST' })
  if (!response.ok) throw new Error('sign out failed')
  // A full page load, so nothing from the signed-in session stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign('/home')
}
