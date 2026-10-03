"use client"
import Link from 'next/link'
import { DropdownMenu } from 'radix-ui'
import { Check, ChevronDown, Keyboard, Lock, Monitor } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useFormat } from '@/i18n/useFormat'
import type { PracticeDevice } from '@/lib/devices'

const item = 'flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none relative data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

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
  const format = useFormat()
  const label = device ? format.device(device) : t('notSelected')
  return <DropdownMenu.Root onOpenChange={onOpenChange}>
    <DropdownMenu.Trigger disabled={locked} aria-label={t('label', { device: label })} title={t(locked ? 'locked' : 'change')}
      className="inline-flex h-8 max-w-28 shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-background sm:max-w-52 dark:bg-input/30">
      <Keyboard className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{device ? label : t('unselected')}</span>
      {locked ? <Lock className="size-3 shrink-0" aria-hidden="true" /> : <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />}
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={6} onCloseAutoFocus={onCloseAutoFocus} className="z-50 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{t('heading')}</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={device?.id ?? 'none'} onValueChange={value => onChange(value === 'none' ? '' : value)}>
          {[{ id: 'none', label: t('none') }, ...devices.map(item => ({ id: item.id, label: format.device(item) }))].map(option =>
            <DropdownMenu.RadioItem key={option.id} value={option.id} className={item}>
              <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
              <span className="truncate">{option.label}</span>
            </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
        <DropdownMenu.Separator className="my-1 h-px bg-border" />
        <DropdownMenu.Item asChild className={item}>
          <Link href="/devices"><Monitor className="absolute left-2.5 size-4" aria-hidden="true" />{t('manage')}</Link>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
