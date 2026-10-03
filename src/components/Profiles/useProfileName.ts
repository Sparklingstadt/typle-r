"use client"
import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, type ProfileDraft } from '@/lib/profiles'

// The first profile keeps its initial stored name until renamed; show that name in the reader's language.
export function useProfileName() {
  const t = useTranslations('profiles')
  return useCallback((profile: ProfileDraft) =>
    profile.id === DEFAULT_PROFILE_ID && profile.name === DEFAULT_PROFILE_NAME ? t('defaultName') : profile.name, [t])
}
