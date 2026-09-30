import Link from "next/link"
import { Keyboard } from "lucide-react"

export default function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/home" onClick={onNavigate} className="flex h-10 shrink-0 items-center gap-2.5 rounded-md px-1 text-lg font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-primary-foreground"><Keyboard className="size-4" /></span>
      Typle
    </Link>
  )
}
