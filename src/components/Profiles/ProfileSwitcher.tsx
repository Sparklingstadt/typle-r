"use client"
import Link from 'next/link'
import { DropdownMenu } from 'radix-ui'
import { Check, ChevronsUpDown, UsersRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'
import { useHasUnsavedChanges } from '@/lib/unsavedChanges'
import { useWordLists } from '@/lib/useWordLists'
import ProfileMark from './ProfileMark'
import { useProfileName } from './useProfileName'

const item = 'relative flex cursor-pointer items-center gap-2.5 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50'

/** Top of the sidebar and the mobile drawer: which profile's word lists and records the app shows. */
export default function ProfileSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { profiles, profile, profileId, selectProfile, ready, saving } = useWordLists()
  const unsaved = useHasUnsavedChanges()
  const t = useTranslations('profiles.switcher')
  const displayName = useProfileName()
  if (ready && !profile) return null
  if (!ready || !profile) return <div className="flex h-12 items-center gap-2.5 px-2"><Skeleton className="size-8 rounded-md" /><Skeleton className="h-4 w-24" /><span className="sr-only">{t('loading')}</span></div>
  const name = displayName(profile)
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger aria-label={t('label', { name })}
      className="flex h-12 w-full items-center gap-2.5 rounded-lg border bg-card px-2 text-left outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-accent">
      <ProfileMark name={name} index={profiles.indexOf(profile)} />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="text-[11px] text-muted-foreground">{t('caption')}</span>
        <span className="truncate text-sm font-medium">{name}</span>
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
          {t(unsaved ? 'unsaved' : 'heading')}
        </DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={profileId} onValueChange={id => { selectProfile(id); onNavigate?.() }}>
          {profiles.map((option, index) => <DropdownMenu.RadioItem key={option.id} value={option.id} disabled={saving || unsaved} className={item}>
            <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
            <ProfileMark name={displayName(option)} index={index} small />
            <span className="truncate">{displayName(option)}</span>
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
        <DropdownMenu.Separator className="my-1 h-px bg-border" />
        <DropdownMenu.Item asChild className={item}>
          <Link href="/profiles" onClick={onNavigate}><UsersRound className="absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true" />{t('manage')}</Link>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
