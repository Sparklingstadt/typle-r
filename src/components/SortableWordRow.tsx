"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** Mobile: a card (number and actions on top, fields below). md+: one table-like row. */
export const WORD_ROW_COLUMNS = "grid-cols-[auto_minmax(0,1fr)_auto] gap-2 md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem_minmax(0,0.8fr)_5.25rem] md:items-center md:gap-3"

export default function SortableWordRow({ id, index, disabled, invalid, children }: {
  id: string
  index: number
  disabled: boolean
  invalid: boolean
  children: ReactNode
}) {
  const t = useTranslations("wordLists.wordRow")
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })

  return <div ref={setNodeRef} role="group" aria-label={t("label", { n: index + 1 })}
    style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 1 : undefined }}
    className={cn("grid", WORD_ROW_COLUMNS, "rounded-xl border p-3 md:rounded-none md:border-0 md:border-b md:px-6 md:py-1.5",
      isDragging ? "bg-muted shadow-md" : invalid ? "border-destructive/40 bg-destructive/5" : "bg-card md:bg-transparent md:hover:bg-muted/40")}>
    <div className="col-start-1 row-start-1 flex items-center gap-1">
      <Button ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}
        variant="ghost" size="icon" className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={t("drag", { n: index + 1 })} title={t("dragTitle")}>
        <GripVertical aria-hidden="true" />
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">{index + 1}</span>
    </div>
    {children}
  </div>
}
