import Link from 'next/link'
import type { PracticeDevice } from '@/lib/devices'
import { deviceLabel } from '@/lib/devices'

export default function DeviceSelector({ devices, selectedId, disabled, onChange }: {
  devices: PracticeDevice[]; selectedId: string; disabled: boolean; onChange: (id: string) => void
}) {
  return <div className="my-4 space-y-2">
    <label htmlFor="practice-device" className="block text-sm font-medium">使用端末</label>
    <select id="practice-device" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm disabled:opacity-60"
      value={selectedId} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="">未選択（端末を記録しない）</option>
      {devices.map(device => <option key={device.id} value={device.id}>{deviceLabel(device)}</option>)}
    </select>
    <p className="text-sm text-muted-foreground">練習開始後は端末を変更できません。<Link href="/devices" className="underline">端末を管理</Link></p>
  </div>
}
