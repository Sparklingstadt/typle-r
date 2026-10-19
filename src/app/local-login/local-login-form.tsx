"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export default function LocalLoginForm({ login }: { login: () => Promise<void> }) {
  const [error, setError] = useState('')
  const t = useTranslations('account.localLogin')
  const router = useRouter()
  const { update } = useSession()
  return <form action={async () => {
    setError('')
    try {
      await login()
      await update()
      router.push('/play')
      router.refresh()
    } catch { setError(t('failed')) }
  }}>
    <Button type="submit">{t('start')}</Button>
    {error && <p role="alert">{error}</p>}
  </form>
}
