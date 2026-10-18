"use client"
import { HardDrive } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/** Where lists, records and devices are saved: this browser. */
export default function StorageBadge({ className }: { className?: string }) {
  const t = useTranslations("nav.storage")
  return (
    <span
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs font-medium text-foreground/70", className)}
      title={t("browserDetail")}
    >
      <HardDrive aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="sr-only">{t("label")}</span>{t("browser")}
    </span>
  )
}
