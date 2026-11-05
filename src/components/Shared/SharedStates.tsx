import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ErrorAlert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useErrorText } from '@/i18n/useErrorText'

export function SharedLoading() {
  const t = useTranslations('wordLists.sharedPage')
  return <div role="status" aria-label={t('loading')} className="space-y-3">
    <Skeleton className="h-8 w-1/2" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-40 w-full" />
  </div>
}

export function OpenPacks() {
  const t = useTranslations('wordLists.sharedPage')
  return <Button asChild variant="outline"><Link href="/edit">{t('toPacks')}</Link></Button>
}

export function SharedEnded() {
  const errors = useTranslations('errors')
  return <div className="space-y-4">
    <p role="status" className="text-lg font-bold">{errors('sharedPackNotFound')}</p>
    <OpenPacks />
  </div>
}

export function SharedFailed({ reason }: { reason: unknown }) {
  const t = useTranslations('wordLists.sharedPage')
  const errorText = useErrorText()
  return <div className="space-y-4">
    <ErrorAlert>{errorText(reason, t('loadFailed'))}</ErrorAlert>
    <OpenPacks />
  </div>
}
