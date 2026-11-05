import * as React from "react"
import { cn } from "cn"

const pageWidths = { narrow: "max-w-4xl", medium: "max-w-5xl", wide: "max-w-6xl" }

// The centered main column of a page, with the page's gutters.
function PageMain({ width, className, ...props }: React.ComponentProps<"main"> & { width: keyof typeof pageWidths }) {
  return <main data-slot="page-main" className={cn("mx-auto w-full px-4 pt-8 pb-16 sm:px-6 lg:px-8", pageWidths[width], className)} {...props} />
}

export { PageMain }
