"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function LocalLoginForm({ login }: { login: () => Promise<void> }) {
  const [error, setError] = useState('')
  const router = useRouter()
  const { update } = useSession()
  return <form action={async () => {
    setError('')
    try {
      await login()
      await update()
      router.push('/play')
      router.refresh()
    } catch { setError('ログインできませんでした。もう一度お試しください。') }
  }}>
    <Button type="submit">練習を始める</Button>
    {error && <p role="alert">{error}</p>}
  </form>
}
