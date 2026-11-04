"use client"

import { cn } from "cn"
import { Search, X } from "lucide-react"

// A bordered search box with the icon inside the border. Height and outer margins come from `className`.
function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  className?: string
}) {
  return (
    <label
      data-slot="search-field"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  )
}

const SIZES = {
  default: {
    icon: "left-3",
    input: "h-10 pr-9 pl-9",
    button: "right-2 size-7",
  },
  sm: {
    icon: "left-2.5",
    input: "h-9 pr-8 pl-8",
    button: "right-1.5 size-6",
  },
}

// A search box with the icon at the left and a clear button at the right while there is a value.
// `label` is both the screen-reader text and the placeholder.
function ClearableSearchField({
  value,
  onChange,
  label,
  clearLabel,
  size = "default",
  className,
  inputClassName,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  clearLabel: string
  size?: "default" | "sm"
  className?: string
  inputClassName?: string
}) {
  const sizes = SIZES[size]
  return (
    <label
      data-slot="search-field"
      className={cn("relative min-w-0 flex-1", className)}
    >
      <span className="sr-only">{label}</span>
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          sizes.icon
        )}
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className={cn(
          "w-full rounded-lg border border-input text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden",
          sizes.input,
          inputClassName
        )}
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange("")}
          className={cn(
            "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            sizes.button
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </label>
  )
}

export { ClearableSearchField, SearchField }
