'use client'
import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AppError } from '@/core/appError'

// Turns a caught error into text in the reader's language. Errors that are not ours (a failed request, a bug) show
// `fallback` instead, since their message is not written for the reader.
export function useErrorText() {
  const t = useTranslations('errors')
  return useCallback((reason: unknown, fallback: string) =>
    reason instanceof AppError && t.has(reason.key) ? t(reason.key, reason.values) : fallback, [t])
}
