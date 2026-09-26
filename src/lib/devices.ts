export type PracticeDevice = { id: string; name: string; layout: string }

export function isDevice(value: unknown): value is PracticeDevice {
  if (!value || typeof value !== 'object') return false
  const device = value as Record<string, unknown>
  return typeof device.id === 'string' && device.id.length > 0 && device.id.length <= 100 &&
    typeof device.name === 'string' && device.name.trim().length > 0 && device.name.length <= 100 &&
    typeof device.layout === 'string' && device.layout.length <= 200
}

export function decodeDevices(value: unknown): PracticeDevice[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isDevice) ||
    new Set(value.map(device => device.id)).size !== value.length) throw new Error('端末データの形式を確認してください。')
  return value.map(({ id, name, layout }) => ({ id, name: name.trim(), layout: layout.trim() }))
}

export function saveDevice(devices: PracticeDevice[], device: PracticeDevice, editing: boolean) {
  const normalized = decodeDevices([device])[0]
  if (editing && !devices.some(item => item.id === device.id)) throw new Error('この端末は削除されています。')
  if (devices.some(item => item.id !== device.id && item.name.toLocaleLowerCase() === normalized.name.toLocaleLowerCase())) {
    throw new Error('同じ名前の端末があります。別の名前を指定してください。')
  }
  return decodeDevices(editing ? devices.map(item => item.id === device.id ? normalized : item) : [...devices, normalized])
}

export function deviceLabel(device?: PracticeDevice) {
  return device ? `${device.name}${device.layout ? `（${device.layout}）` : ''}` : '未記録'
}
