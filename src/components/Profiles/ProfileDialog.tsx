"use client"
import { useId, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
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
  const draftId = useRef(profile?.id ?? '')
  const [name, setName] = useState(profile?.name ?? '')
  const [use, setUse] = useState(true)
  const [problem, setProblem] = useState<ProfileProblem | null>(null)
  const [failed, setFailed] = useState(false)
  const editing = profile !== null
  const nameError = problem?.field === 'name' ? problem.message : ''
  const formError = problem?.field === 'form' ? problem.message : failed ? error || '保存できませんでした。もう一度お試しください。' : ''

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
      <DialogTitle>{editing ? 'プロファイル名を変更' : 'プロファイルを追加'}</DialogTitle>
      <DialogDescription>{editing ? '単語リストと練習記録はそのまま残ります。' : '新しいプロファイルは、単語リストと練習記録が空の状態で始まります。'}</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor={`${id}-name`}><span>プロファイル名<span aria-hidden="true" className="text-destructive">*</span></span></Label>
      <Input id={`${id}-name`} value={name} maxLength={MAX_PROFILE_NAME} autoComplete="off" className="h-11"
        placeholder="例：中国語" aria-required="true" aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? `${id}-name-error ${id}-name-help` : `${id}-name-help`}
        onChange={event => { setName(event.target.value); if (nameError) setProblem(null) }} />
      {nameError && <p id={`${id}-name-error`} className="flex items-start gap-1.5 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{nameError}
      </p>}
      <p id={`${id}-name-help`} className="text-xs text-muted-foreground">サイドバーの切り替えメニューに表示されます。練習の目的ごとに分けると便利です。</p>
    </div>
    {!editing && <div className="flex items-start gap-2.5 text-sm">
      <input id={`${id}-use`} type="checkbox" checked={use} onChange={event => setUse(event.target.checked)}
        aria-describedby={`${id}-use-help`} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary" />
      <div className="grid gap-0.5">
        <label htmlFor={`${id}-use`} className="cursor-pointer">追加したプロファイルに切り替える</label>
        <p id={`${id}-use-help`} className="text-xs text-muted-foreground">切り替えはブラウザーごとに覚えます。</p>
      </div>
    </div>}
    {formError && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{formError}</AlertDescription></Alert>}
    <DialogFooter>
      <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>キャンセル</Button>
      <Button type="submit" disabled={saving}>{saving ? '保存中…' : editing ? '変更を保存' : '追加する'}</Button>
    </DialogFooter>
  </form>
}
