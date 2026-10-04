"use client"
import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import type { PracticeDevice } from '@/core/devices'

/** The per-browser device choice, shared by the practice screen's menu and the devices screen: 未選択 first, then each device. */
export function useDeviceOptions(devices: PracticeDevice[], device?: PracticeDevice) {
  const t = useTranslations('devices.choice')
  const format = useFormat()
  return {
    label: device ? format.device(device) : t('notSelected'),
    options: [{ id: 'none', label: t('none') }, ...devices.map(option => ({ id: option.id, label: format.device(option) }))],
  }
}
