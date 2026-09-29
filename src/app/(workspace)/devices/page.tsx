"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, HardDrive, History, Monitor, Pencil, Plus, Trash2 } from 'lucide-react'
import { useWordLists } from '@/lib/useWordLists'
import { GUEST_ACCOUNT_ID } from '@/lib/guestWorkspace'
import { useSelectedDevice } from '@/lib/deviceSelection'
import { formatDay } from '@/lib/dashboard'
import { deviceUsage, MAX_DEVICES, saveDevice, type DeviceUsage, type PracticeDevice } from '@/lib/devices'
import type { SavedWordList } from '@/lib/wordLists'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { useSaveNotification } from '@/components/SaveNotification'
import CurrentDevice from '@/components/Devices/CurrentDevice'
import DeviceDialog, { type DeviceDialogState } from '@/components/Devices/DeviceDialog'

export default function Devices() {
  const workspace = useWordLists()
  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">端末</h1>
        <p className="text-sm text-muted-foreground">
          練習に使うパソコンやキーボードを登録します。<Link href="/play" className="underline underline-offset-3 hover:text-foreground">遊ぶ</Link>で選ぶと、どの端末で練習したかが記録に残ります。
        </p>
      </div>
      {workspace.ready && <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground"
        title={workspace.accountId === GUEST_ACCOUNT_ID ? '未ログインのため、このブラウザーのLocalStorageに保存します。' : 'ログイン中のアカウントに保存します。'}>
        <HardDrive className="size-3.5" aria-hidden="true" />{workspace.accountId === GUEST_ACCOUNT_ID ? 'このブラウザーに保存' : 'アカウントに保存'}
      </span>}
    </header>
    {workspace.error && <Alert variant="destructive" className="mb-6"><AlertDescription>{workspace.error}</AlertDescription></Alert>}
    {!workspace.ready ? <div role="status" className="space-y-3"><p>読み込み中…</p><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
      : <DeviceManager key={workspace.accountId} {...workspace} accountId={workspace.accountId ?? ''} />}
  </main>
}

function usageText(usage: DeviceUsage | undefined, now: Date) {
  return usage ? `練習 ${usage.count}回 · 最終 ${formatDay(new Date(usage.lastUsed), now)}` : 'まだ練習していません'
}

function DeviceManager({ accountId, devices, lists, saving, error, updateDevices }: {
  accountId: string
  devices: PracticeDevice[]
  lists: SavedWordList[]
  saving: boolean
  error: string
  updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => Promise<boolean>
}) {
  const notify = useSaveNotification()
  const [selectedId, choose] = useSelectedDevice(accountId)
  const usage = useMemo(() => deviceUsage(lists), [lists])
  const [now] = useState(() => new Date())
  const [dialog, setDialog] = useState<DeviceDialogState>({ open: false, device: null, session: 0 })
  const [deleting, setDeleting] = useState<{ open: boolean; device: PracticeDevice | null }>({ open: false, device: null })
  const [highlight, setHighlight] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const deleted = useRef(false)
  const list = useRef<HTMLUListElement>(null)
  const selected = devices.find(device => device.id === selectedId)
  const full = devices.length >= MAX_DEVICES

  // Briefly mark the row that was just added or changed, and bring it into view.
  useEffect(() => {
    if (!highlight) return
    list.current?.querySelector(`[data-device-id="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'nearest' })
    const timer = window.setTimeout(() => setHighlight(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlight])

  function remember() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  function openDialog(device: PracticeDevice | null) {
    remember()
    setDialog(current => ({ open: true, device, session: current.session + 1 }))
  }
  function restoreFocus(event: Event) {
    event.preventDefault()
    if (opener.current?.isConnected) opener.current.focus()
    else document.getElementById('device-list-heading')?.focus()
  }

  async function save(device: PracticeDevice, use: boolean) {
    const editing = dialog.device !== null
    const saved = await updateDevices(current => saveDevice(current, device, editing))
    if (!saved) return false
    if (!editing && use) choose(device.id)
    setDialog(current => ({ ...current, open: false }))
    setHighlight(device.id)
    notify(`端末「${device.name.trim()}」を${editing ? '保存' : '追加'}しました。`)
    return true
  }

  return <div className="space-y-8">
    {devices.length > 0 && <CurrentDevice devices={devices} device={selected} onChange={choose} />}
    <section aria-labelledby="device-list-heading" className="space-y-3">
      <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2">
        <h2 id="device-list-heading" tabIndex={-1} className="text-base font-bold outline-none">登録済みの端末</h2>
        {devices.length > 0 && <Badge variant="secondary" className="tabular-nums">{devices.length}台</Badge>}
        {devices.length > 0 && <Button className="ml-auto" disabled={full || saving} onClick={() => openDialog(null)}><Plus aria-hidden="true" />端末を追加</Button>}
      </div>
      {full && <p className="text-sm text-muted-foreground">端末は{MAX_DEVICES}台まで登録できます。使わなくなった端末を削除すると追加できます。</p>}
      {devices.length ? <ul ref={list} className="divide-y overflow-hidden rounded-xl border bg-card">
        {devices.map(device => {
          const current = device.id === selected?.id
          return <li key={device.id} data-device-id={device.id}
            className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3.5 transition-colors duration-700 motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_10rem_auto] sm:items-center sm:gap-x-4 sm:px-5',
              highlight === device.id && 'bg-green-50 duration-0 dark:bg-green-950/40')}>
            <span className="hidden size-10 place-items-center rounded-lg bg-muted text-muted-foreground sm:grid"><Monitor className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="font-medium [overflow-wrap:anywhere]">{device.name}</h3>
                {current && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                  title="このブラウザーで練習に使う端末です"><Check aria-hidden="true" />使用中</Badge>}
              </div>
              {device.layout && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{device.layout}</p>}
            </div>
            <p className="col-start-1 row-start-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums sm:col-start-3 sm:row-start-1 sm:text-[13px]">
              <History className="size-3.5 shrink-0" aria-hidden="true" />{usageText(usage.get(device.id), now)}
            </p>
            <div className="col-start-2 row-span-2 row-start-1 -mr-2 flex items-center sm:col-start-4 sm:row-span-1 sm:mr-0">
              <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" disabled={saving}
                aria-label={`${device.name} を編集`} title="編集" onClick={() => openDialog(device)}><Pencil aria-hidden="true" /></Button>
              <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" disabled={saving}
                aria-label={`${device.name} を削除`} title="削除" onClick={() => { remember(); deleted.current = false; setDeleting({ open: true, device }) }}><Trash2 aria-hidden="true" /></Button>
            </div>
          </li>
        })}
      </ul> : <EmptyState onAdd={() => openDialog(null)} />}
    </section>

    <DeviceDialog state={dialog} devices={devices} records={dialog.device ? usage.get(dialog.device.id)?.count ?? 0 : 0}
      offerUse={!selected} saving={saving} error={error} onSave={save} onCloseAutoFocus={restoreFocus}
      onOpenChange={open => setDialog(current => ({ ...current, open }))} />

    {deleting.device && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={`端末「${deleting.device.name}」を削除しますか？`}
      description={deleteDescription(deleting.device, usage.get(deleting.device.id), deleting.device.id === selected?.id)}
      onCloseAutoFocus={event => {
        if (!deleted.current) return restoreFocus(event)
        event.preventDefault()
        document.getElementById('device-list-heading')?.focus()
      }}
      onConfirm={async () => {
        const device = deleting.device
        if (!device) return false
        const saved = await updateDevices(current => current.filter(item => item.id !== device.id))
        if (saved) {
          deleted.current = true
          if (device.id === selectedId) choose('')
          notify(`端末「${device.name}」を削除しました。`)
        }
        return saved
      }} />}
  </div>
}

function deleteDescription(device: PracticeDevice, usage: DeviceUsage | undefined, current: boolean) {
  return [
    `一覧から「${device.name}」を削除します。`,
    usage ? `この端末で練習した${usage.count}回分の記録は削除されず、練習した時点の端末名のまま残ります。` : 'この端末で練習した記録はありません。',
    current ? 'このブラウザーで練習に使う端末は「未選択」に戻ります。' : '',
  ].join('')
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:py-12">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Monitor className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h3 className="font-bold">端末はまだ登録されていません</h3>
      <p className="max-w-md text-sm text-balance text-muted-foreground">登録した端末を「遊ぶ」で選ぶと、どの端末で練習したかが記録に残り、端末ごとの記録を見比べられます。</p>
    </div>
    <Button onClick={onAdd}><Plus aria-hidden="true" />端末を追加</Button>
    <p className="text-xs text-muted-foreground">例：MacBook Air（JIS）、デスクトップ＋HHKB（US）</p>
  </div>
}
