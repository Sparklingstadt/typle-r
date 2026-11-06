import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

// The square icon at the start of a card or row.
function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span data-slot="icon-tile" className={cn("grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground", className)}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
  )
}

export { IconTile }
