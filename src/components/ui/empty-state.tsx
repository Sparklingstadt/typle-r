import * as React from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

// A one-line dashed note for a list that has nothing to show.
function EmptyNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-note"
      className={cn("rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

// A centered dashed card for an empty page or section. Callers pass the vertical padding.
function EmptyState({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 text-center", className)}
      {...props}
    />
  )
}

// The round icon at the top of an EmptyState. `className` can give it its own colors.
function EmptyStateIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span data-slot="empty-state-icon" className={cn("grid size-12 place-items-center rounded-full bg-muted text-muted-foreground", className)}>
      <Icon className="size-6" aria-hidden="true" />
    </span>
  )
}

export { EmptyNote, EmptyState, EmptyStateIcon }
