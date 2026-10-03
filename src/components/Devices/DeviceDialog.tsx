"use client"
import { useId, useRef, useState } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { randomId } from '@/lib/randomId'
import { deviceProblem, MAX_DEVICE_LAYOUT, MAX_DEVICE_NAME, type DeviceProblem, type PracticeDevice } from '@/lib/devices'

export type DeviceDialogState = { open: boolean; device: PracticeDevice | null; session: number }

function FieldError({ id, message }: { id: string; message: string }) {
  return <p id={id} className="flex items-start gap-1.5 text-sm text-destructive">
    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{message}
  </p>
}

// Adds a device, or edits one in place of the row that opened it. `onSave` resolves false when the workspace could not be saved.
export default function DeviceDialog({ state, devices, records, offerUse, saving, error, onOpenChange, onSave, onCloseAutoFocus }: {
  state: DeviceDialogState
  devices: PracticeDevice[]
  records: number
  offerUse: boolean
  saving: boolean
  error: string
  onOpenChange: (open: boolean) => void
  onSave: (device: PracticeDevice, use: boolean) => Promise<boolean>
  onCloseAutoFocus: (event: Event) => void
}) {
  return <Dialog open={state.open} onOpenChange={open => { if (!saving) onOpenChange(open) }}>
    <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
      <DeviceForm key={state.session} device={state.device} devices={devices} records={records} offerUse={offerUse}
        saving={saving} error={error} onCancel={() => onOpenChange(false)} onSave={onSave} />
    </DialogContent>
  </Dialog>
}

function DeviceForm({ device, devices, records, offerUse, saving, error, onCancel, onSave }: {
  device: PracticeDevice | null
  devices: PracticeDevice[]
  records: number
  offerUse: boolean
  saving: boolean
  error: string
  onCancel: () => void
  onSave: (device: PracticeDevice, use: boolean) => Promise<boolean>
}) {
  const id = useId()
  const t = useTranslations('devices.dialog')
  const errors = useTranslations('errors')
  const draftId = useRef(device?.id ?? '')
  const [name, setName] = useState(device?.name ?? '')
  const [layout, setLayout] = useState(device?.layout ?? '')
  const [use, setUse] = useState(offerUse)
  const [problem, setProblem] = useState<DeviceProblem | null>(null)
  const [failed, setFailed] = useState(false)
  const editing = device !== null
  const message = problem && errors(problem.key, problem.values)
  const nameError = problem?.field === 'name' ? message : ''
  const layoutError = problem?.field === 'layout' ? message : ''
  const formError = problem?.field === 'form' ? message : failed ? error || t('saveFailed') : ''

  return <form noValidate className="grid gap-5" onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    draftId.current ||= randomId()
    const draft = { id: draftId.current, name, layout }
    const found = deviceProblem(devices, draft, editing)
    setProblem(found)
    setFailed(false)
    if (found) {
      if (found.field !== 'form') document.getElementById(`${id}-${found.field}`)?.focus()
      return
    }
    if (!await onSave(draft, use)) setFailed(true)
  }}>
    <DialogHeader>
      <DialogTitle>{t(editing ? 'editTitle' : 'addTitle')}</DialogTitle>
      <DialogDescription>{t(editing ? 'editDescription' : 'addDescription')}</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor={`${id}-name`}><span>{t('name')}<span aria-hidden="true" className="text-destructive">*</span></span></Label>
      <Input id={`${id}-name`} value={name} maxLength={MAX_DEVICE_NAME} autoComplete="off" className="h-11"
        placeholder={t('namePlaceholder')} aria-required="true" aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? `${id}-name-error ${id}-name-help` : `${id}-name-help`}
        onChange={event => { setName(event.target.value); if (nameError) setProblem(null) }} />
      {nameError && <FieldError id={`${id}-name-error`} message={nameError} />}
      <p id={`${id}-name-help`} className="text-xs text-muted-foreground">{t('nameHelp')}</p>
    </div>
    <div className="grid gap-2">
      {/* One flex item, so the accessible name stays 配列・メモ（任意） without an inserted space. */}
      <Label htmlFor={`${id}-layout`}><span>{t('layout')}<span className="font-normal text-muted-foreground">{t('optional')}</span></span></Label>
      <Input id={`${id}-layout`} value={layout} maxLength={MAX_DEVICE_LAYOUT} autoComplete="off" className="h-11"
        placeholder={t('layoutPlaceholder')} aria-invalid={layoutError ? true : undefined}
        aria-describedby={layoutError ? `${id}-layout-error ${id}-layout-help` : `${id}-layout-help`}
        onChange={event => { setLayout(event.target.value); if (layoutError) setProblem(null) }} />
      {layoutError && <FieldError id={`${id}-layout-error`} message={layoutError} />}
      <p id={`${id}-layout-help`} className="text-xs text-muted-foreground">{t('layoutHelp')}</p>
    </div>
    {editing && records > 0 && <p className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{t('renameNote', { count: records })}</span>
    </p>}
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
