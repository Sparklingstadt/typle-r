"use client"
import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import { DEFAULT_DEVICE_ID, defaultDevice, type PracticeDevice } from '@/core/devices'

/** The per-browser device choice, shared by the practice screen's menu and the devices screen: the built-in デフォルト,
 * each registered device, then 未選択. */
export function useDeviceOptions(devices: PracticeDevice[], device?: PracticeDevice) {
  const t = useTranslations('devices.choice')
  const format = useFormat()
  return {
    label: device ? format.device(device) : t('notSelected'),
    options: [{ id: DEFAULT_DEVICE_ID, label: format.device(defaultDevice('')) }, ...devices.map(option => ({ id: option.id, label: format.device(option) })),
      { id: 'none', label: t('none') }],
  }
}
