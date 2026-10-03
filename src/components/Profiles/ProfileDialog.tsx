"use client"
import { useId, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { randomId } from '@/lib/randomId'
import { MAX_PROFILE_NAME, profileProblem, type ProfileDraft, type ProfileProblem } from '@/lib/profiles'

export type ProfileDialogState = { open: boolean; profile: ProfileDraft | null; session: number }

// Adds a profile, or renames the one whose row opened it. `onSave` resolves false when the workspace could not be saved.
export default function ProfileDialog({ state, profiles, saving, error, onOpenChange, onSave, onCloseAutoFocus }: {
  state: ProfileDialogState
  profiles: ProfileDraft[]
  saving: boolean
  error: string
  onOpenChange: (open: boolean) => void
  onSave: (profile: ProfileDraft, use: boolean) => Promise<boolean>
  onCloseAutoFocus: (event: Event) => void
}) {
  return <Dialog open={state.open} onOpenChange={open => { if (!saving) onOpenChange(open) }}>
    <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
      <ProfileForm key={state.session} profile={state.profile} profiles={profiles}
        saving={saving} error={error} onCancel={() => onOpenChange(false)} onSave={onSave} />
    </DialogContent>
  </Dialog>
}

function ProfileForm({ profile, profiles, saving, error, onCancel, onSave }: {
  profile: ProfileDraft | null
  profiles: ProfileDraft[]
  saving: boolean
  error: string
  onCancel: () => void
  onSave: (profile: ProfileDraft, use: boolean) => Promise<boolean>
}) {
  const id = useId()
  const t = useTranslations('profiles.dialog')
  const errors = useTranslations('errors')
  const draftId = useRef(profile?.id ?? '')
  const [name, setName] = useState(profile?.name ?? '')
  const [use, setUse] = useState(true)
  const [problem, setProblem] = useState<ProfileProblem | null>(null)
  const [failed, setFailed] = useState(false)
  const editing = profile !== null
  const message = problem && errors(problem.key, problem.values)
  const nameError = problem?.field === 'name' ? message : ''
  const formError = problem?.field === 'form' ? message : failed ? error || t('saveFailed') : ''

  return <form noValidate className="grid gap-5" onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    draftId.current ||= randomId()
    const draft = { id: draftId.current, name }
    const found = profileProblem(profiles, draft, editing)
    setProblem(found)
    setFailed(false)
    if (found) {
      if (found.field === 'name') document.getElementById(`${id}-name`)?.focus()
      return
    }
    if (!await onSave(draft, use)) setFailed(true)
  }}>
    <DialogHeader>
      <DialogTitle>{t(editing ? 'renameTitle' : 'addTitle')}</DialogTitle>
      <DialogDescription>{t(editing ? 'renameDescription' : 'addDescription')}</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor={`${id}-name`}><span>{t('name')}<span aria-hidden="true" className="text-destructive">*</span></span></Label>
      <Input id={`${id}-name`} value={name} maxLength={MAX_PROFILE_NAME} autoComplete="off" className="h-11"
        placeholder={t('namePlaceholder')} aria-required="true" aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? `${id}-name-error ${id}-name-help` : `${id}-name-help`}
        onChange={event => { setName(event.target.value); if (nameError) setProblem(null) }} />
      {nameError && <p id={`${id}-name-error`} className="flex items-start gap-1.5 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{nameError}
      </p>}
      <p id={`${id}-name-help`} className="text-xs text-muted-foreground">{t('nameHelp')}</p>
    </div>
    {!editing && <div className="flex items-start gap-2.5 text-sm">
      <input id={`${id}-use`} type="checkbox" checked={use} onChange={event => setUse(event.target.checked)}
        aria-describedby={`${id}-use-help`} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary" />
      <div className="grid gap-0.5">
        <label htmlFor={`${id}-use`} className="cursor-pointer">{t('use')}</label>
        <p id={`${id}-use-help`} className="text-xs text-muted-foreground">{t('useHelp')}</p>
      </div>
    </div>}
    {formError && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{formError}</AlertDescription></Alert>}
    <DialogFooter>
      <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>{t('cancel')}</Button>
      <Button type="submit" disabled={saving}>{saving ? t('saving') : t(editing ? 'save' : 'add')}</Button>
    </DialogFooter>
  </form>
}
