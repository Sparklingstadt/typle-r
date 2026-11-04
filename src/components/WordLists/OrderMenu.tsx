"use client"
import { useTranslations } from "next-intl"
import { DropdownMenu } from "radix-ui"
import { Check, ChevronDown } from "lucide-react"
import { LIST_ORDERS, type ListOrder } from "@/core/listOverview"

export default function OrderMenu({ value, onChange }: { value: ListOrder; onChange: (value: ListOrder) => void }) {
  const t = useTranslations('wordLists.order')
  const item = 'relative flex cursor-pointer items-center gap-2 rounded-md py-2 pr-3 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger aria-label={t('current', { order: t(value) })}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30">
      <span className="text-muted-foreground">{t('label')}</span>{t(value)}<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.RadioGroup value={value} onValueChange={next => onChange(next as ListOrder)}>
          {LIST_ORDERS.map(key => <DropdownMenu.RadioItem key={key} value={key} className={item}>
            <DropdownMenu.ItemIndicator className="absolute left-2.5 inline-flex"><Check className="size-4" aria-hidden="true" /></DropdownMenu.ItemIndicator>
            {t(key)}
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
