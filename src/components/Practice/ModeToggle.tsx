"use client"
import { RadioGroup } from 'radix-ui'
import type { PracticeMode } from '@/core/records'

// Typing or Typle Writing; used by the practice screen and ベスト記録, each with its own labels.
export default function ModeToggle({ value, onChange, label, labels }: {
  value: PracticeMode
  onChange: (value: PracticeMode) => void
  label: string
  labels: Record<PracticeMode, string>
}) {
  return <RadioGroup.Root value={value} onValueChange={next => onChange(next as PracticeMode)} aria-label={label} orientation="horizontal"
    className="inline-flex h-9 shrink-0 items-center rounded-full border bg-muted/60 p-0.5 text-[13px]">
    {(['typing', 'writing'] as const).map(option =>
      <RadioGroup.Item key={option} value={option}
        className="h-full rounded-full px-3 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:bg-input">
        {labels[option]}
      </RadioGroup.Item>)}
  </RadioGroup.Root>
}
