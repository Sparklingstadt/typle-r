"use client"
import { useTranslations } from 'next-intl'
import { LogIn } from 'lucide-react'
import { ErrorAlert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignInCard({ error, refused }: { error?: string; refused: string | null }) {
  const t = useTranslations('admin')
  return <Card className="max-w-lg">
    <CardHeader>
      <CardTitle>{t('signIn.title')}</CardTitle>
      <CardDescription>{t('signIn.description')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {(error || refused) && <ErrorAlert>{error ?? refused}</ErrorAlert>}
      <Button asChild><a href="/api/auth/signin?admin=1"><LogIn aria-hidden="true" />{t('signIn.button')}</a></Button>
    </CardContent>
  </Card>
}
