"use client"
import { RadioGroup } from 'radix-ui'

// A choice among practice modes; used by the practice screen (typing or handwriting, and the handwriting pad or the
// field) and ベスト記録 (every mode), each with its own labels.
export default function ModeToggle<T extends string>({ options, value, onChange, label, labels, disabled }: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  label: string
  labels: Record<T, string>
  disabled?: boolean
}) {
  return <RadioGroup.Root value={value} onValueChange={next => onChange(next as T)} aria-label={label} orientation="horizontal" disabled={disabled}
    className="inline-flex h-9 shrink-0 items-center rounded-full border bg-muted/60 p-0.5 text-[13px]">
    {options.map(option =>
      <RadioGroup.Item key={option} value={option}
        className="h-full rounded-full px-3 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:bg-input">
        {labels[option]}
      </RadioGroup.Item>)}
  </RadioGroup.Root>
}
