"use client"
import { useTranslations } from "next-intl"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// A list in the order of its pack: the handle sorts it by dragging or by the keyboard, as the word rows do.
export default function SortableListRow({ id, name, levels, wordCount, disabled }: {
  id: string
  name: string
  levels: string
  wordCount: string
  disabled: boolean
}) {
  const t = useTranslations("wordLists.packEditor")
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return <li ref={setNodeRef} role="group" aria-label={name}
    style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 1 : undefined }}
    className={cn("flex items-center gap-2 rounded-xl border p-3", isDragging ? "bg-muted shadow-md" : "bg-card")}>
    <Button ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}
      variant="ghost" size="icon" className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
      aria-label={t("drag", { name })} title={t("dragTitle")}>
      <GripVertical aria-hidden="true" />
    </Button>
    <div className="min-w-0 flex-1">
      <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
      <p className="text-xs text-muted-foreground">{levels}</p>
    </div>
    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{wordCount}</span>
  </li>
}
