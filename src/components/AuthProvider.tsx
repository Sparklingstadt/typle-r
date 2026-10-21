"use client"
import { SessionProvider } from '@/lib/session'
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
