import { AppError, type ErrorKey, type ErrorValues } from './appError'

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
    new Set(value.map(device => device.id)).size !== value.length) throw new AppError('deviceDataInvalid')
  return value.map(({ id, name, layout }) => ({ id, name: name.trim(), layout: layout.trim() }))
}

export type DeviceProblem = { field: 'name' | 'layout' | 'form'; key: ErrorKey; values?: ErrorValues }

// Explains why a device cannot be saved, in terms of the field to fix, before the generic decode check runs.
export function deviceProblem(devices: PracticeDevice[], device: PracticeDevice, editing: boolean): DeviceProblem | null {
  const name = device.name.trim()
  if (!name) return { field: 'name', key: 'deviceNameRequired' }
  if (device.name.length > MAX_DEVICE_NAME) return { field: 'name', key: 'deviceNameTooLong', values: { max: MAX_DEVICE_NAME } }
  if (device.layout.length > MAX_DEVICE_LAYOUT) return { field: 'layout', key: 'deviceLayoutTooLong', values: { max: MAX_DEVICE_LAYOUT } }
  if (editing && !devices.some(item => item.id === device.id)) return { field: 'form', key: 'deviceDeleted' }
  const same = devices.find(item => item.id !== device.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (same) return { field: 'name', key: 'deviceNameDuplicate', values: { name: same.name } }
  if (!editing && devices.length >= MAX_DEVICES) {
    return { field: 'form', key: 'deviceLimit', values: { max: MAX_DEVICES } }
  }
  return null
}

export function saveDevice(devices: PracticeDevice[], device: PracticeDevice, editing: boolean) {
  const problem = deviceProblem(devices, device, editing)
  if (problem) throw new AppError(problem.key, problem.values)
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
