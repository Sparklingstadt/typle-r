import type { ReactNode } from "react"
import Link from "next/link"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

/** A notice shown in place of a screen that cannot be used, with an optional way back. */
export default function Notice({ children, link }: { children: ReactNode; link?: { href: string; label: string } }) {
  return <Alert>
    <CircleAlert aria-hidden="true" />
    <AlertDescription className="flex flex-wrap items-center gap-x-3">
      <span>{children}</span>
      {link && <Link href={link.href} className="underline underline-offset-4">{link.label}</Link>}
    </AlertDescription>
  </Alert>
}
