"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, History, Monitor, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import { useWordLists } from '@/lib/useWordLists'
import { useChosenDevice } from '@/lib/deviceSelection'
import { DEFAULT_DEVICE_ID, defaultDevice, deviceUsage, MAX_DEVICES, saveDevice, type DeviceUsage, type PracticeDevice } from '@/core/devices'
import type { SavedWordList } from '@/core/wordLists'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { useSaveNotification } from '@/components/SaveNotification'
import CurrentDevice from '@/components/Devices/CurrentDevice'
import DeviceDialog, { type DeviceDialogState } from '@/components/Devices/DeviceDialog'
import PageStorageBadge from '@/components/PageStorageBadge'

export default function Devices() {
  const workspace = useWordLists()
  const t = useTranslations('devices')
  const common = useTranslations('common')
  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t.rich('description', { link: chunks => <Link href="/play" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link> })}
        </p>
      </div>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </header>
    {workspace.error && <Alert variant="destructive" className="mb-6"><AlertDescription>{workspace.error}</AlertDescription></Alert>}
    {!workspace.ready ? <div role="status" className="space-y-3"><p>{common('loading')}</p><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
      : <DeviceManager key={workspace.accountId} {...workspace} accountId={workspace.accountId ?? ''} />}
  </main>
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
  const t = useTranslations('devices')
  const format = useFormat()
  const defaultName = useTranslations('format')('defaultDevice')
  const [selected, choose] = useChosenDevice(accountId, devices)
  const usage = useMemo(() => deviceUsage(lists), [lists])
  const [now] = useState(() => new Date())
  const usageText = (item: DeviceUsage | undefined) =>
    item ? t('usage', { count: item.count, day: format.day(new Date(item.lastUsed), now) }) : t('neverUsed')
  const deleteDescription = (device: PracticeDevice, item: DeviceUsage | undefined, current: boolean) => t('deleteDescription', {
    removal: t('deleteRemoval', { name: device.name }),
    records: item ? t('deleteRecords', { count: item.count }) : t('deleteNoRecords'),
    current: current ? 'yes' : 'no',
  })
  const [dialog, setDialog] = useState<DeviceDialogState>({ open: false, device: null, session: 0 })
  const [deleting, setDeleting] = useState<{ open: boolean; device: PracticeDevice | null }>({ open: false, device: null })
  const [highlight, setHighlight] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const deleted = useRef(false)
  const list = useRef<HTMLUListElement>(null)
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
    notify(t(editing ? 'saved' : 'added', { name: device.name.trim() }))
    return true
  }

  return <div className="space-y-8">
    <CurrentDevice devices={devices} device={selected} onChange={choose} />
    <section aria-labelledby="device-list-heading" className="space-y-3">
      <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-2">
        <h2 id="device-list-heading" tabIndex={-1} className="text-base font-bold outline-none">{t('listHeading')}</h2>
        {devices.length > 0 && <Badge variant="secondary" className="tabular-nums">{t('count', { count: devices.length })}</Badge>}
        {devices.length > 0 && <Button className="ml-auto" disabled={full || saving} onClick={() => openDialog(null)}><Plus aria-hidden="true" />{t('add')}</Button>}
      </div>
      {full && <p className="text-sm text-muted-foreground">{t('limit', { max: MAX_DEVICES })}</p>}
      <ul ref={list} className="divide-y overflow-hidden rounded-xl border bg-card">
        {[defaultDevice(defaultName), ...devices].map(device => {
          const current = device.id === selected?.id
          const builtIn = device.id === DEFAULT_DEVICE_ID
          return <li key={device.id} data-device-id={device.id}
            className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3.5 transition-colors duration-700 motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_10rem_auto] sm:items-center sm:gap-x-4 sm:px-5',
              highlight === device.id && 'bg-green-50 duration-0 dark:bg-green-950/40')}>
            <span className="hidden size-10 place-items-center rounded-lg bg-muted text-muted-foreground sm:grid"><Monitor className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="font-medium [overflow-wrap:anywhere]">{device.name}</h3>
                {current && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                  title={t('inUseDetail')}><Check aria-hidden="true" />{t('inUse')}</Badge>}
              </div>
              {builtIn ? <p className="text-sm text-muted-foreground">{t('defaultDetail')}</p>
                : device.layout && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{device.layout}</p>}
            </div>
            <p className="col-start-1 row-start-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums sm:col-start-3 sm:row-start-1 sm:text-[13px]">
              <History className="size-3.5 shrink-0" aria-hidden="true" />{usageText(usage.get(device.id))}
            </p>
            {!builtIn && <div className="col-start-2 row-span-2 row-start-1 -mr-2 flex items-center sm:col-start-4 sm:row-span-1 sm:mr-0">
              <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" disabled={saving}
                aria-label={t('editLabel', { name: device.name })} title={t('edit')} onClick={() => openDialog(device)}><Pencil aria-hidden="true" /></Button>
              <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" disabled={saving}
                aria-label={t('deleteLabel', { name: device.name })} title={t('delete')} onClick={() => { remember(); deleted.current = false; setDeleting({ open: true, device }) }}><Trash2 aria-hidden="true" /></Button>
            </div>}
          </li>
        })}
      </ul>
      {!devices.length && <EmptyState onAdd={() => openDialog(null)} />}
    </section>

    <DeviceDialog state={dialog} devices={devices} records={dialog.device ? usage.get(dialog.device.id)?.count ?? 0 : 0}
      offerUse={!selected || selected.id === DEFAULT_DEVICE_ID} saving={saving} error={error} onSave={save} onCloseAutoFocus={restoreFocus}
      onOpenChange={open => setDialog(current => ({ ...current, open }))} />

    {deleting.device && <DeleteConfirmation open={deleting.open} onOpenChange={open => setDeleting(current => ({ ...current, open }))}
      title={t('deleteTitle', { name: deleting.device.name })}
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
          if (device.id === selected?.id) choose(DEFAULT_DEVICE_ID)
          notify(t('deleted', { name: device.name }))
        }
        return saved
      }} />}
  </div>
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('devices')
  return <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:py-12">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Monitor className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h3 className="font-bold">{t('empty.title')}</h3>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.description')}</p>
    </div>
    <Button onClick={onAdd}><Plus aria-hidden="true" />{t('add')}</Button>
    <p className="text-xs text-muted-foreground">{t('empty.example')}</p>
  </div>
}
