"use client"
import { useId, useRef, useState } from 'react'
import { CircleAlert, Info } from 'lucide-react'
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
  const draftId = useRef(device?.id ?? '')
  const [name, setName] = useState(device?.name ?? '')
  const [layout, setLayout] = useState(device?.layout ?? '')
  const [use, setUse] = useState(offerUse)
  const [problem, setProblem] = useState<DeviceProblem | null>(null)
  const [failed, setFailed] = useState(false)
  const editing = device !== null
  const nameError = problem?.field === 'name' ? problem.message : ''
  const layoutError = problem?.field === 'layout' ? problem.message : ''
  const formError = problem?.field === 'form' ? problem.message : failed ? error || '保存できませんでした。もう一度お試しください。' : ''

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
      <DialogTitle>{editing ? '端末を編集' : '端末を追加'}</DialogTitle>
      <DialogDescription>{editing ? '表示する名前と配列・メモを変更します。' : '練習に使う端末を登録します。'}</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor={`${id}-name`}><span>端末名<span aria-hidden="true" className="text-destructive">*</span></span></Label>
      <Input id={`${id}-name`} value={name} maxLength={MAX_DEVICE_NAME} autoComplete="off" className="h-11"
        placeholder="例：MacBook Air" aria-required="true" aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? `${id}-name-error ${id}-name-help` : `${id}-name-help`}
        onChange={event => { setName(event.target.value); if (nameError) setProblem(null) }} />
      {nameError && <FieldError id={`${id}-name-error`} message={nameError} />}
      <p id={`${id}-name-help`} className="text-xs text-muted-foreground">練習画面の端末メニューと練習記録に表示されます。</p>
    </div>
    <div className="grid gap-2">
      {/* One flex item, so the accessible name stays 「配列・メモ（任意）」 without an inserted space. */}
      <Label htmlFor={`${id}-layout`}><span>配列・メモ<span className="font-normal text-muted-foreground">（任意）</span></span></Label>
      <Input id={`${id}-layout`} value={layout} maxLength={MAX_DEVICE_LAYOUT} autoComplete="off" className="h-11"
        placeholder="例：JIS、US" aria-invalid={layoutError ? true : undefined}
        aria-describedby={layoutError ? `${id}-layout-error ${id}-layout-help` : `${id}-layout-help`}
        onChange={event => { setLayout(event.target.value); if (layoutError) setProblem(null) }} />
      {layoutError && <FieldError id={`${id}-layout-error`} message={layoutError} />}
      <p id={`${id}-layout-help`} className="text-xs text-muted-foreground">配列や設定の違いを書いておくと、記録を見比べるときの目印になります。</p>
    </div>
    {editing && records > 0 && <p className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>名前を変えても、これまでの練習記録（{records}回）には練習した時点の名前が残ります。</span>
    </p>}
    {!editing && <div className="flex items-start gap-2.5 text-sm">
      <input id={`${id}-use`} type="checkbox" checked={use} onChange={event => setUse(event.target.checked)}
        aria-describedby={`${id}-use-help`} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary" />
      <div className="grid gap-0.5">
        <label htmlFor={`${id}-use`} className="cursor-pointer">このブラウザーで練習に使う端末にする</label>
        <p id={`${id}-use-help`} className="text-xs text-muted-foreground">「練習する」で練習したとき、この端末が記録に残ります。</p>
      </div>
    </div>}
    {formError && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{formError}</AlertDescription></Alert>}
    <DialogFooter>
      <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>キャンセル</Button>
      <Button type="submit" disabled={saving}>{saving ? '保存中…' : editing ? '変更を保存' : '追加する'}</Button>
    </DialogFooter>
  </form>
}
