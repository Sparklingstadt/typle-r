import { AppError, type ErrorKey, type ErrorValues } from './appError'

export type PracticeDevice = { id: string; name: string; layout: string }

export const MAX_DEVICES = 100
export const MAX_DEVICE_NAME = 100
export const MAX_DEVICE_LAYOUT = 200

// Every account has the built-in デフォルト device, which a browser practises on until another is chosen. It is not
// stored with the registered devices (so it needs no migration, cannot be edited or deleted and does not count
// toward MAX_DEVICES), and its name is shown in the reader's language by this id.
export const DEFAULT_DEVICE_ID = 'default'

export function defaultDevice(name: string): PracticeDevice {
  return { id: DEFAULT_DEVICE_ID, name, layout: '' }
}

/** The device a browser's stored choice names: none for 未選択 (''), and the built-in device when nothing was chosen
 * yet (null) or the chosen device has since been deleted. */
export function chosenDevice(devices: PracticeDevice[], id: string | null, defaultName: string): PracticeDevice | undefined {
  if (id === '') return undefined
  return devices.find(device => device.id === id) ?? defaultDevice(defaultName)
}

/** Whether records on this device id still have a device to practise on, rather than a deleted one. */
export function deviceExists(devices: PracticeDevice[], id: string) {
  return id === DEFAULT_DEVICE_ID || devices.some(device => device.id === id)
}

export function isDevice(value: unknown): value is PracticeDevice {
  if (!value || typeof value !== 'object') return false
  const device = value as Record<string, unknown>
  return typeof device.id === 'string' && device.id.length > 0 && device.id.length <= 100 &&
    typeof device.name === 'string' && device.name.trim().length > 0 && device.name.length <= MAX_DEVICE_NAME &&
    typeof device.layout === 'string' && device.layout.length <= MAX_DEVICE_LAYOUT
}

export function decodeDevices(value: unknown): PracticeDevice[] {
  if (!Array.isArray(value) || value.length > MAX_DEVICES || !value.every(isDevice) || value.some(device => device.id === DEFAULT_DEVICE_ID) ||
    new Set(value.map(device => device.id)).size !== value.length) throw new AppError('deviceDataInvalid')
  return value.map(({ id, name, layout }) => ({ id, name: name.trim(), layout: layout.trim() }))
}

export type DeviceProblem = { field: 'name' | 'layout' | 'form'; key: ErrorKey; values?: ErrorValues }

// Explains why a device cannot be saved, in terms of the field to fix, before the generic decode check runs.
// `defaultName` is the built-in device's name in the reader's language, which a registered device may not reuse.
export function deviceProblem(devices: PracticeDevice[], device: PracticeDevice, editing: boolean, defaultName = ''): DeviceProblem | null {
  const name = device.name.trim()
  if (!name) return { field: 'name', key: 'deviceNameRequired' }
  if (device.name.length > MAX_DEVICE_NAME) return { field: 'name', key: 'deviceNameTooLong', values: { max: MAX_DEVICE_NAME } }
  if (device.layout.length > MAX_DEVICE_LAYOUT) return { field: 'layout', key: 'deviceLayoutTooLong', values: { max: MAX_DEVICE_LAYOUT } }
  if (editing && !devices.some(item => item.id === device.id)) return { field: 'form', key: 'deviceDeleted' }
  const same = devices.find(item => item.id !== device.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (same) return { field: 'name', key: 'deviceNameDuplicate', values: { name: same.name } }
  if (defaultName && name.toLocaleLowerCase() === defaultName.toLocaleLowerCase()) {
    return { field: 'name', key: 'deviceNameDuplicate', values: { name: defaultName } }
  }
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
