"use client"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { LIST_ORDERS, type ListOrder } from "@/core/listOverview"

export default function OrderMenu({ value, onChange }: { value: ListOrder; onChange: (value: ListOrder) => void }) {
  const t = useTranslations('wordLists.order')
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={t('current', { order: t(value) })}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30">
      <span className="text-muted-foreground">{t('label')}</span>{t(value)}<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" sideOffset={6} className="w-48">
      <DropdownMenuRadioGroup value={value} onValueChange={next => onChange(next as ListOrder)}>
        {LIST_ORDERS.map(key => <DropdownMenuRadioItem key={key} value={key}>
          {t(key)}
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
