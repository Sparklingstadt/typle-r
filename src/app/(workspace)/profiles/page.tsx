"use client"
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, Check, Cloud, HardDrive, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useWordLists, type Workspace } from '@/lib/useWordLists'
import { GUEST_ACCOUNT_ID } from '@/lib/guestWorkspace'
import { DEFAULT_PROFILE_ID, MAX_PROFILES, removeProfile, saveProfile, type ProfileDraft, type ProfileSummary } from '@/lib/profiles'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { useSaveNotification } from '@/components/SaveNotification'
import ProfileDialog, { type ProfileDialogState } from '@/components/Profiles/ProfileDialog'
import ProfileMark from '@/components/Profiles/ProfileMark'
import { useProfileName } from '@/components/Profiles/useProfileName'

export default function Profiles() {
  const workspace = useWordLists()
  const t = useTranslations('profiles')
  const common = useTranslations('common')
  const guest = workspace.accountId === GUEST_ACCOUNT_ID
  const StorageIcon = guest ? HardDrive : Cloud
  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t.rich('description', { link: chunks => <Link href="/devices" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link> })}
        </p>
      </div>
      {workspace.ready && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
        title={t(guest ? 'storage.guestDetail' : 'storage.accountDetail')}>
        <StorageIcon className="size-3.5" aria-hidden="true" />{t(guest ? 'storage.guest' : 'storage.account')}
      </span>}
    </header>
    {workspace.error && <Alert variant="destructive" className="mb-6"><AlertDescription>{workspace.error}</AlertDescription></Alert>}
    {!workspace.ready || !workspace.profile ? <div role="status" className="space-y-3"><p>{common('loading')}</p><Skeleton className="h-40 w-full" /></div>
      : <ProfileManager workspace={workspace} />}
  </main>
}

// Each count stays on one line when the row narrows.
function Counts({ profile }: { profile: ProfileSummary }) {
  const t = useTranslations('profiles.counts')
  return <p className="text-xs text-muted-foreground tabular-nums sm:text-[13px]">
    <span className="whitespace-nowrap">{t('lists', { count: profile.listCount })}</span> · <span className="whitespace-nowrap">{t('records', { count: profile.recordCount })}</span>
  </p>
}

function ProfileManager({ workspace }: { workspace: Workspace }) {
  const { lists, profileId, saving, error, selectProfile, updateProfiles } = workspace
  const notify = useSaveNotification()
  const t = useTranslations('profiles')
  const displayName = useProfileName()
  // The profile in use counts what is on screen, including the samples shown before the first save.
  const profiles = workspace.profiles.map(profile => profile.id === profileId
    ? { ...profile, listCount: lists.length, recordCount: lists.reduce((total, list) => total + list.records.length, 0) } : profile)
  const [dialog, setDialog] = useState<ProfileDialogState>({ open: false, profile: null, session: 0 })
  const [deleting, setDeleting] = useState<{ open: boolean; profile: ProfileSummary | null }>({ open: false, profile: null })
  const [highlight, setHighlight] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const deleted = useRef(false)
  const list = useRef<HTMLUListElement>(null)
  const full = profiles.length >= MAX_PROFILES
  const first = profiles[0]
  const deleteDescription = (profile: ProfileSummary, current: boolean) => t('deleteDescription', {
    removal: t('deleteRemoval', { name: displayName(profile), lists: profile.listCount, records: profile.recordCount }),
    others: t('deleteOthers'),
    selection: current ? t('deleteSelection', { first: displayName(first) }) : '',
  }).trim()

  // Briefly mark the row that was just added or renamed, and bring it into view.
  useEffect(() => {
    if (!highlight) return
    list.current?.querySelector(`[data-profile-id="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'nearest' })
    const timer = window.setTimeout(() => setHighlight(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlight])

  function remember() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  function openDialog(profile: ProfileDraft | null) {
    remember()
    setDialog(current => ({ open: true, profile, session: current.session + 1 }))
  }
  function restoreFocus(event: Event) {
    event.preventDefault()
    if (opener.current?.isConnected) opener.current.focus()
    else document.getElementById('profile-list-heading')?.focus()
  }

  async function save(profile: ProfileDraft, use: boolean) {
    const editing = dialog.profile !== null
    const saved = await updateProfiles(current => saveProfile(current, profile, editing))
    if (!saved) return false
    setDialog(current => ({ ...current, open: false }))
    const name = profile.name.trim()
    if (!editing && use) {
      selectProfile(profile.id)
      notify(t('addedAndSwitched', { name }))
    } else {
      setHighlight(profile.id)
      notify(t(editing ? 'renamed' : 'added', { name }))
    }
    return true
  }

  function switchTo(profile: ProfileSummary) {
    selectProfile(profile.id)
    notify(t('switched', { name: displayName(profile) }))
  }

  return <div className="space-y-3">
    <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2">
      <h2 id="profile-list-heading" tabIndex={-1} className="text-base font-bold outline-none">{t('listHeading')}</h2>
      <Badge variant="secondary" className="tabular-nums" title={t('limitDetail', { max: MAX_PROFILES })}>{profiles.length} / {MAX_PROFILES}</Badge>
      <Button className="ml-auto" disabled={full || saving} onClick={() => openDialog(null)}><Plus aria-hidden="true" />{t('add')}</Button>
    </div>
    {full && <p className="text-sm text-muted-foreground">{t('limit', { max: MAX_PROFILES })}</p>}
    <ul ref={list} aria-labelledby="profile-list-heading" className="divide-y overflow-hidden rounded-xl border bg-card">
      {profiles.map((profile, index) => {
        const current = profile.id === profileId
        const removable = profile.id !== DEFAULT_PROFILE_ID
        const name = displayName(profile)
        return <li key={profile.id} data-profile-id={profile.id}
          className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors duration-700 motion-reduce:transition-none sm:gap-x-4 sm:px-5',
            highlight === profile.id && 'bg-green-50 duration-0 dark:bg-green-950/40')}>
          <ProfileMark name={name} index={index} className="size-10 text-base" />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-medium [overflow-wrap:anywhere]">{name}</h3>
              {current && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                title={t('inUseDetail')}><Check aria-hidden="true" />{t('inUse')}</Badge>}
            </div>
            <Counts profile={profile} />
          </div>
          <div className="-mr-2 flex items-center sm:mr-0">
            {!current && <Button variant="outline" className="mr-1" disabled={saving} aria-label={t('switchLabel', { name })}
              onClick={() => switchTo(profile)}><ArrowRightLeft aria-hidden="true" /><span className="hidden sm:inline">{t('switch')}</span></Button>}
            <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" disabled={saving}
              aria-label={t('renameLabel', { name })} title={t('rename')} onClick={() => openDialog({ id: profile.id, name })}><Pencil aria-hidden="true" /></Button>
            {removable ? <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" disabled={saving}
              aria-label={t('deleteLabel', { name })} title={t('delete')} onClick={() => { remember(); deleted.current = false; setDeleting({ open: true, profile }) }}><Trash2 aria-hidden="true" /></Button>
              : <span className="size-10" />}
          </div>
        </li>
      })}
    </ul>
    <p className="text-[13px] text-muted-foreground">
      {t('note', { first: displayName(first) })}
    </p>

    <ProfileDialog state={dialog} profiles={profiles} saving={saving} error={error} onSave={save} onCloseAutoFocus={restoreFocus}
      onOpenChange={open => setDialog(current => ({ ...current, open }))} />

    {deleting.profile && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={t('deleteTitle', { name: displayName(deleting.profile) })}
      description={deleteDescription(deleting.profile, deleting.profile.id === profileId)}
      onCloseAutoFocus={event => {
        if (!deleted.current) return restoreFocus(event)
        event.preventDefault()
        document.getElementById('profile-list-heading')?.focus()
      }}
      onConfirm={async () => {
        const profile = deleting.profile
        if (!profile) return false
        const saved = await updateProfiles(current => removeProfile(current, profile.id))
        if (saved) {
          deleted.current = true
          notify(t('deleted', { name: displayName(profile) }))
        }
        return saved
      }} />}
  </div>
}

