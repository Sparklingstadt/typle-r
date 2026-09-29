export type PracticeDevice = { id: string; name: string; layout: string }

export const MAX_DEVICES = 100
export const MAX_DEVICE_NAME = 100
export const MAX_DEVICE_LAYOUT = 200

export function isDevice(value: unknown): value is PracticeDevice {
  if (!value || typeof value !== 'object') return false
  const device = value as Record<string, unknown>
  return typeof device.id === 'string' && device.id.length > 0 && device.id.length <= 100 &&
    typeof device.name === 'string' && device.name.trim().length > 0 && device.name.length <= MAX_DEVICE_NAME &&
    typeof device.layout === 'string' && device.layout.length <= MAX_DEVICE_LAYOUT
}

export function decodeDevices(value: unknown): PracticeDevice[] {
  if (!Array.isArray(value) || value.length > MAX_DEVICES || !value.every(isDevice) ||
    new Set(value.map(device => device.id)).size !== value.length) throw new Error('端末データの形式を確認してください。')
  return value.map(({ id, name, layout }) => ({ id, name: name.trim(), layout: layout.trim() }))
}

export type DeviceProblem = { field: 'name' | 'layout' | 'form'; message: string }

// Explains why a device cannot be saved, in terms of the field to fix, before the generic decode check runs.
export function deviceProblem(devices: PracticeDevice[], device: PracticeDevice, editing: boolean): DeviceProblem | null {
  const name = device.name.trim()
  if (!name) return { field: 'name', message: '端末名を入力してください。' }
  if (device.name.length > MAX_DEVICE_NAME) return { field: 'name', message: `端末名は${MAX_DEVICE_NAME}文字以内で入力してください。` }
  if (device.layout.length > MAX_DEVICE_LAYOUT) return { field: 'layout', message: `配列・メモは${MAX_DEVICE_LAYOUT}文字以内で入力してください。` }
  if (editing && !devices.some(item => item.id === device.id)) return { field: 'form', message: 'この端末は別の画面で削除されています。' }
  const same = devices.find(item => item.id !== device.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (same) return { field: 'name', message: `「${same.name}」はすでに登録されています。別の名前にしてください。` }
  if (!editing && devices.length >= MAX_DEVICES) {
    return { field: 'form', message: `端末は${MAX_DEVICES}台まで登録できます。使わなくなった端末を削除してから追加してください。` }
  }
  return null
}

export function saveDevice(devices: PracticeDevice[], device: PracticeDevice, editing: boolean) {
  const problem = deviceProblem(devices, device, editing)
  if (problem) throw new Error(problem.message)
  const normalized = decodeDevices([device])[0]
  return decodeDevices(editing ? devices.map(item => item.id === device.id ? normalized : item) : [...devices, normalized])
}

export type DeviceUsage = { count: number; lastUsed: string }

// Records keep a snapshot of the device, so its id still links them after the device is renamed.
export function deviceUsage(lists: { records: { date: string; device?: PracticeDevice }[] }[]) {
  const usage = new Map<string, DeviceUsage>()
  for (const record of lists.flatMap(list => list.records)) {
    if (!record.device) continue
    const current = usage.get(record.device.id)
    if (!current) usage.set(record.device.id, { count: 1, lastUsed: record.date })
    else usage.set(record.device.id, { count: current.count + 1, lastUsed: Date.parse(record.date) > Date.parse(current.lastUsed) ? record.date : current.lastUsed })
  }
  return usage
}

export function deviceLabel(device?: PracticeDevice) {
  return device ? `${device.name}${device.layout ? `（${device.layout}）` : ''}` : '未記録'
}
