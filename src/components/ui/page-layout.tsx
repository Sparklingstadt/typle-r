import * as React from "react"
import { cn } from "cn"

const pageWidths = { narrow: "max-w-4xl", medium: "max-w-5xl", wide: "max-w-6xl" }

// The centered main column of a page, with the page's gutters.
function PageMain({ width, className, ...props }: React.ComponentProps<"main"> & { width: keyof typeof pageWidths }) {
  return <main data-slot="page-main" className={cn("mx-auto w-full px-4 pt-8 pb-16 sm:px-6 lg:px-8", pageWidths[width], className)} {...props} />
}

// A page's heading and description. `children` sit at the end of the row, and wrap under the text when it runs out of room.
function PageHeader({ title, description, children }: { title: React.ReactNode; description: React.ReactNode; children?: React.ReactNode }) {
  return <header data-slot="page-header" className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div className="space-y-1">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {children}
  </header>
}

export { PageHeader, PageMain }
