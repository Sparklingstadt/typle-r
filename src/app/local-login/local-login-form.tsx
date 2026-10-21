"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export default function LocalLoginForm() {
  const [error, setError] = useState('')
  const t = useTranslations('account.localLogin')
  const router = useRouter()
  const { update } = useSession()
  return <form action={async () => {
    setError('')
    try {
      const response = await fetch('/api/auth/local', { method: 'POST' })
      if (!response.ok) throw new Error('local login failed')
      await update()
      router.push('/play')
      router.refresh()
    } catch { setError(t('failed')) }
  }}>
    <Button type="submit">{t('start')}</Button>
    {error && <p role="alert">{error}</p>}
  </form>
}
