"use client"
import { useState } from 'react'
import { randomId } from '@/lib/randomId'
import { useWordLists } from '@/lib/useWordLists'
import { saveDevice, type PracticeDevice } from '@/lib/devices'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { useSaveNotification } from '@/components/SaveNotification'
import Page from '@/components/Page/Page'
import PageContainer from '@/components/PageContainer/PageContainer'

export default function Devices() {
  const workspace = useWordLists()
  return <Page><PageContainer>
    <h1 className="mb-4 text-2xl">端末</h1>
    <p className="mb-6">練習に使う端末やキーボードを登録します。「遊ぶ」で使用端末を選ぶと、練習記録に残せます。</p>
    {workspace.error && <Alert variant="destructive" className="my-4"><AlertDescription>{workspace.error}</AlertDescription></Alert>}
    {!workspace.ready ? <p>読み込み中…</p> : <DeviceManager key={workspace.accountId} {...workspace} />}
  </PageContainer></Page>
}

function DeviceManager({ devices, saving, updateDevices }: {
  devices: PracticeDevice[]; saving: boolean
  updateDevices: (change: (current: PracticeDevice[]) => PracticeDevice[]) => Promise<boolean>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState('')
  const [error, setError] = useState('')
  const notify = useSaveNotification()
  function reset() { setEditing(null); setName(''); setLayout(''); setError('') }
  return <div className="space-y-6">
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault()
      const device = { id: editing ?? randomId(), name, layout }
      try { saveDevice(devices, device, editing !== null) }
      catch (reason) { setError(reason instanceof Error ? reason.message : '入力内容を確認してください。'); return }
      setError('')
      if (await updateDevices(current => saveDevice(current, device, editing !== null))) {
        reset(); notify(`端末「${name.trim()}」を保存しました。`)
      }
    }}>
      <h2 className="text-xl">{editing ? '端末を編集' : '端末を追加'}</h2>
      <div className="space-y-2"><Label htmlFor="device-name">端末名</Label>
        <Input id="device-name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例：MacBook Air、デスクトップ＋外付けキーボード" /></div>
      <div className="space-y-2"><Label htmlFor="device-layout">配列・メモ（任意）</Label>
        <Input id="device-layout" maxLength={200} value={layout} onChange={event => setLayout(event.target.value)} placeholder="例：JIS、US、Ctrl と Caps Lock を入れ替え" /></div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex gap-2"><Button disabled={saving} type="submit">{saving ? '保存中…' : '端末を保存'}</Button>
        {editing && <Button type="button" variant="outline" disabled={saving} onClick={reset}>キャンセル</Button>}</div>
    </form>
    <section aria-label="登録済みの端末" className="space-y-3">
      <h2 className="text-xl">登録済みの端末</h2>
      {!devices.length && <p>端末はまだ登録されていません。</p>}
      {devices.map(device => <Card key={device.id}><CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 break-all"><h3 className="font-medium">{device.name}</h3><p className="text-sm text-muted-foreground">{device.layout || '配列・メモなし'}</p></div>
        <div className="flex gap-2"><Button variant="outline" disabled={saving} aria-label={`${device.name} を編集`} onClick={() => {
          setEditing(device.id); setName(device.name); setLayout(device.layout); setError('')
          document.getElementById('device-name')?.focus()
        }}>編集</Button>
        <DeleteConfirmation label={`${device.name} を削除`} description={`端末「${device.name}」を削除します。過去の練習記録に残した端末情報は保持されます。`} onConfirm={async () => {
          const saved = await updateDevices(current => current.filter(item => item.id !== device.id))
          if (saved) { if (editing === device.id) reset(); notify(`端末「${device.name}」を削除しました。`) }
          return saved
        }} /></div>
      </CardContent></Card>)}
    </section>
  </div>
}
