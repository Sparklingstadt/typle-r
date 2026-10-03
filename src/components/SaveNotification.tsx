"use client"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const NotificationContext = createContext<(message: string) => void>(() => {})
type Notification = { message: string; id: number }

export function useSaveNotification() {
  return useContext(NotificationContext)
}

function Toast({ notification, dismiss }: { notification: Notification; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false)
  const t = useTranslations('common')
  const [focused, setFocused] = useState(false)
  const [exiting, setExiting] = useState(false)
  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(() => dismiss(notification.id), 300)
    return () => window.clearTimeout(timer)
  }, [exiting, notification.id, dismiss])
  useEffect(() => {
    if (hovered || focused || exiting) return
    const timer = window.setTimeout(() => setExiting(true), 5000)
    return () => window.clearTimeout(timer)
  }, [notification.id, hovered, focused, exiting])

  return <Alert role="status" aria-live="polite" aria-atomic="true"
    className={`flex items-center gap-3 border-green-800 bg-green-800 px-4 py-4 text-white shadow-lg duration-300 motion-reduce:animate-none motion-reduce:transition-none ${exiting ? 'animate-out slide-out-to-bottom-4 fade-out fill-mode-forwards pointer-events-none' : 'animate-in slide-in-from-bottom-4 fade-in'}`}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    }}>
    <span className="flex shrink-0 items-center"><Check aria-hidden="true" className="size-5" /></span>
    <span className="min-w-0 flex-1 break-words">{notification.message}</span>
    <Button size="icon-sm" variant="ghost" className="shrink-0 text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/70"
      aria-label={t('closeNotification')} onClick={() => setExiting(true)}><X aria-hidden="true" /></Button>
  </Alert>
}

export default function SaveNotification({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const nextId = useRef(0)
  const t = useTranslations('common')
  const notify = useCallback((message: string) => {
    const notification = { message, id: ++nextId.current }
    setNotifications(current => [...current, notification])
  }, [])
  const dismiss = useCallback((id: number) => {
    setNotifications(current => current.filter(notification => notification.id !== id))
  }, [])

  return <NotificationContext.Provider value={notify}>
    {children}
    <div className="fixed bottom-4 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[90%] -translate-x-1/2 flex-col gap-3 overflow-y-auto p-1 sm:w-[70%]" aria-label={t('notifications')}>
      {notifications.map(notification => <Toast key={notification.id} notification={notification} dismiss={dismiss} />)}
    </div>
  </NotificationContext.Provider>
}
