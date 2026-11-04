"use client"
import { useTranslations } from "next-intl"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, GripVertical, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// A list in the order of its pack: the handle sorts it by dragging or by the keyboard, and the menu moves it without dragging, as the word rows do.
export default function SortableListRow({ id, name, levels, wordCount, index, count, disabled, onMove }: {
  id: string
  name: string
  levels: string
  wordCount: string
  /** The row's place in the order, and how many rows there are. */
  index: number
  count: number
  disabled: boolean
  /** Moves the row to the place `target`. */
  onMove: (target: number) => void
}) {
  const t = useTranslations("wordLists.packEditor")
  const editor = useTranslations("wordLists.editor")
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const first = index === 0
  const last = index === count - 1
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="ghost" size="icon" aria-label={t("listActions", { name })} title={editor("actions")}><MoreHorizontal aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-52">
        <DropdownMenuItem disabled={first} onSelect={() => onMove(index - 1)}>
          <ArrowUp aria-hidden="true" />{editor("moveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={() => onMove(index + 1)}>
          <ArrowDown aria-hidden="true" />{editor("moveDown")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={first} onSelect={() => onMove(0)}>
          <ArrowUpToLine aria-hidden="true" />{editor("moveFirst")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={last} onSelect={() => onMove(count - 1)}>
          <ArrowDownToLine aria-hidden="true" />{editor("moveLast")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </li>
}
