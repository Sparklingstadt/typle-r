import { cn } from '@/lib/utils'

// Literal class names so Tailwind keeps them. The colour follows the profile's position, so up to six profiles never share one.
const colors = [
  'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
]

export default function ProfileMark({ name, index, small, className }: { name: string; index: number; small?: boolean; className?: string }) {
  const color = colors[Math.max(0, index) % colors.length]
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-md font-semibold', small ? 'size-5 text-[11px]' : 'size-8 text-sm', color, className)}>
    {Array.from(name.trim())[0]?.toUpperCase()}
  </span>
}
