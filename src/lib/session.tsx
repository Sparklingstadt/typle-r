"use client"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type SessionUser = { id: string; name: string; image: string | null }
type SessionData = { user: SessionUser } | null
type SessionState = {
  data: SessionData
  status: 'loading' | 'authenticated' | 'unauthenticated'
  /** Reads the session again and resolves with what it is then: the previous state when the read failed. */
  update: () => Promise<SessionData>
}

const SessionContext = createContext<SessionState>({ data: null, status: 'loading', update: async () => null })

// The waits before the first read is tried again. When all have failed, the session settles on signed out, so the app is
// usable as a guest.
const RETRY_DELAYS_MS = [1000, 2000, 4000]
const SESSION_TIMEOUT_MS = 10_000

/**
 * Reads the signed-in user from the Go backend. Only a 200 answer says who is signed in: null when its `user` is null
 * or left out. Anything else (a failed request, one that timed out, another status, a body that is not the session)
 * rejects, since it does not say that the user signed out.
 */
async function fetchSession(): Promise<SessionData> {
  // A request that hangs (a network that is half there) fails after a while, so that it does not stay in flight for good
  // and hold back every later check.
  const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(SESSION_TIMEOUT_MS) })
  if (response.status !== 200) throw new Error(`session answered ${response.status}`)
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object') throw new Error('session answer is not an object')
  const user = (body as { user?: unknown }).user
  if (user === null || user === undefined) return null
  if (typeof user !== 'object' || typeof (user as { id?: unknown }).id !== 'string') throw new Error('session user is invalid')
  return { user: user as SessionUser }
}

const sameUser = (a: SessionData, b: SessionData) =>
  a?.user.id === b?.user.id && a?.user.name === b?.user.name && a?.user.image === b?.user.image

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SessionData>(null)
  const [loaded, setLoaded] = useState(false)
  // The same as data and loaded, for the callbacks of a read.
  const current = useRef<SessionData>(null)
  const settled = useRef(false)
  const mounted = useRef(true)
  const latest = useRef(0)
  const inflight = useRef<Promise<SessionData> | null>(null)
  const failures = useRef(0)
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The read a retry starts: load, set once it exists.
  const again = useRef(() => {})
  const settle = useCallback((next: SessionData) => {
    // The same user keeps the same object, so a refresh on focus renders nothing again.
    if (!sameUser(current.current, next)) current.current = next
    settled.current = true
    setData(current.current)
    setLoaded(true)
  }, [])
  // A forced read (update) always starts a new request. Only the newest request started is applied, so an older one that
  // resolves late cannot overwrite a fresher result. A read that is not forced joins the one already under way.
  //
  // A failed read changes nothing once the session is known: a passing failure, such as waking from sleep before the
  // network is back, must not sign the user out of the cloud lists. The first read is tried again after each delay of
  // RETRY_DELAYS_MS (sooner when a focus starts a read), and settles on signed out when all have failed.
  const load = useCallback((force: boolean): Promise<SessionData> => {
    if (!force && inflight.current) return inflight.current
    const id = ++latest.current
    clearTimeout(retry.current)
    const request: Promise<SessionData> = fetchSession().then(next => {
      if (inflight.current === request) inflight.current = null
      if (!mounted.current || id !== latest.current) return current.current
      failures.current = 0
      settle(next)
      return current.current
    }, () => {
      if (inflight.current === request) inflight.current = null
      if (!mounted.current || id !== latest.current || settled.current) return current.current
      const delay = RETRY_DELAYS_MS[failures.current++]
      if (delay === undefined) settle(null)
      else retry.current = setTimeout(() => again.current(), delay)
      return current.current
    })
    inflight.current = request
    return request
  }, [settle])
  const refresh = useCallback(() => load(true), [load])
  useEffect(() => {
    mounted.current = true
    again.current = () => { void load(false) }
    void load(false)
    // Another tab may have signed in or out, or switched account: look again whenever this one comes back into view.
    const look = () => { if (document.visibilityState === 'visible') void load(false) }
    document.addEventListener('visibilitychange', look)
    window.addEventListener('focus', look)
    return () => {
      mounted.current = false
      clearTimeout(retry.current)
      document.removeEventListener('visibilitychange', look)
      window.removeEventListener('focus', look)
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
