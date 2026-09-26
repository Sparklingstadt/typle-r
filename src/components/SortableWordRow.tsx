"use client"

import type { ReactNode } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableHead, TableRow } from "@/components/ui/table"

export default function SortableWordRow({ id, index, disabled, children }: {
  id: string
  index: number
  disabled: boolean
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })

  return <TableRow ref={setNodeRef}
    style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 1 : undefined }}
    className={`grid grid-cols-[4.5rem_minmax(0,1fr)] items-start py-2 md:table-row md:py-0 align-top ${isDragging ? "bg-muted shadow-md" : ""}`}>
    <TableHead scope="row">
      <div className="flex items-center gap-1">
        <Button ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}
          variant="ghost" size="icon" className="touch-none cursor-grab active:cursor-grabbing"
          aria-label={`単語 ${index + 1} をドラッグして並べ替え`} title="ドラッグして並べ替え">
          <GripVertical aria-hidden="true" />
        </Button>
        <span>{index + 1}</span>
      </div>
    </TableHead>
    {children}
  </TableRow>
}
