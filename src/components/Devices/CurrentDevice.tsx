"use client"
import Link from 'next/link'
import { ChevronDown, Keyboard, Monitor } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useDeviceOptions } from './useDeviceOptions'
import type { PracticeDevice } from '@/core/devices'

// The same per-browser choice as the device menu on the practice screen, shown where devices are managed.
export default function CurrentDevice({ devices, device, onChange }: {
  devices: PracticeDevice[]
  device?: PracticeDevice
  onChange: (id: string) => void
}) {
  const t = useTranslations('devices.current')
  const { label, options } = useDeviceOptions(devices, device)
  return <section aria-labelledby="current-device-heading" className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4">
      <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><Monitor className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h2 id="current-device-heading" className="text-[13px] text-muted-foreground">{t('heading')}</h2>
        <p className="font-medium [overflow-wrap:anywhere]" aria-live="polite">{label}</p>
      </div>
      <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label={t('changeLabel', { device: label })}>{t('change')}<ChevronDown aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-72 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{t('heading')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={device?.id ?? 'none'} onValueChange={value => onChange(value === 'none' ? '' : value)}>
              {options.map(option =>
                <DropdownMenuRadioItem key={option.id} value={option.id}>
                  <span className="truncate">{option.label}</span>
                </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild variant="outline"><Link href="/play"><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
      </div>
    </div>
    <p className="mt-3 text-[13px] text-muted-foreground sm:pl-14">
      {t(device ? 'noteSelected' : 'noteUnselected')}
    </p>
  </section>
}
