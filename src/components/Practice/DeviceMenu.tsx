"use client"
import Link from 'next/link'
import { ChevronDown, Keyboard, Lock, Monitor } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useDeviceOptions } from '@/components/Devices/useDeviceOptions'
import type { PracticeDevice } from '@/core/devices'

// The device is chosen before the first keystroke and then shown locked, as the record keeps that snapshot.
export default function DeviceMenu({ devices, device, locked, onChange, onOpenChange, onCloseAutoFocus }: {
  devices: PracticeDevice[]
  device?: PracticeDevice
  locked: boolean
  onChange: (id: string) => void
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const t = useTranslations('devices.menu')
  const { label, options } = useDeviceOptions(devices, device)
  return <DropdownMenu onOpenChange={onOpenChange}>
    <DropdownMenuTrigger disabled={locked} aria-label={t('label', { device: label })} title={t(locked ? 'locked' : 'change')}
      className="inline-flex h-8 max-w-28 shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-background sm:max-w-52 dark:bg-input/30">
      <Keyboard className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{device ? label : t('unselected')}</span>
      {locked ? <Lock className="size-3 shrink-0" aria-hidden="true" /> : <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={6} onCloseAutoFocus={onCloseAutoFocus} className="w-64">
      <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{t('heading')}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={device?.id ?? 'none'} onValueChange={value => onChange(value === 'none' ? '' : value)}>
        {options.map(option =>
          <DropdownMenuRadioItem key={option.id} value={option.id}>
            <span className="truncate">{option.label}</span>
          </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild variant="inset">
        <Link href="/devices"><Monitor className="absolute left-2.5 size-4" aria-hidden="true" />{t('manage')}</Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
