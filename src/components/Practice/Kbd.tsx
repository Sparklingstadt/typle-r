import { cn } from '@/lib/utils'

export default function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-5 items-center rounded border bg-background px-1.5 font-sans text-[11px] font-medium text-muted-foreground in-data-[variant=default]:border-current/30 in-data-[variant=default]:bg-transparent in-data-[variant=default]:text-current', className)}>{children}</kbd>
}
