"use client"
import { Search } from "lucide-react"

export default function ListSearchField({ value, onChange, placeholder, ariaLabel, className }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  className: string
}) {
  return <label className={className}>
    <Search className="size-4 shrink-0" aria-hidden="true" />
    <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off"
      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
  </label>
}
