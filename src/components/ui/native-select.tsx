import * as React from "react"
import { cn } from "@/lib/utils"

const base =
  "rounded-lg border outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const variants = {
  form: "h-11 w-full min-w-0 border-input bg-transparent px-2.5 text-base md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover",
  filter: "h-9 w-full min-w-0 bg-background px-2 text-sm dark:bg-input/30",
  compact: "h-8 border-input bg-transparent px-2.5 text-sm dark:bg-input/30",
}

function NativeSelect({
  className,
  variant,
  ...props
}: React.ComponentProps<"select"> & { variant: keyof typeof variants }) {
  return (
    <select
      data-slot="native-select"
      className={cn(base, variants[variant], className)}
      {...props}
    />
  )
}

export { NativeSelect }
