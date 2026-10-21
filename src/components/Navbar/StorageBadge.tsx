"use client"
import { Cloud, HardDrive } from "lucide-react"
import { useSession } from "@/lib/session"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/** Where lists, records and devices are saved. Hidden until the session is known so it never shows the wrong place. */
export default function StorageBadge({ className }: { className?: string }) {
  const { data: session, status } = useSession()
  const t = useTranslations("nav.storage")
  if (status === "loading") return null
  const account = Boolean(session?.user)
  const Icon = account ? Cloud : HardDrive
  return (
    <span
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs font-medium text-foreground/70", className)}
      title={t(account ? "accountDetail" : "browserDetail")}
    >
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="sr-only">{t("label")}</span>{t(account ? "account" : "browser")}
    </span>
  )
}
