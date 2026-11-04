import * as React from "react"
import { cn } from "cn"

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

export { EmptyNote, EmptyState }
