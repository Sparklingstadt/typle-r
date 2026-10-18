"use client"
import { HardDrive } from "lucide-react"
import { useTranslations } from "next-intl"

const points = ["p1", "p2", "p3"] as const

/** Where lists, records and devices are kept: this browser only. */
export default function StorageComparison() {
  const t = useTranslations("about.places")
  return <div className="rounded-xl border bg-card p-4">
    <div className="mb-3 flex items-start gap-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><HardDrive className="size-4" /></span>
      <h3 className="min-w-0 flex-1 font-bold">{t("browser.title")}</h3>
    </div>
    <ul className="space-y-1.5 text-sm">
      {points.map(point => <li key={point} className="flex gap-2">
        <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />{t(`browser.${point}`)}
      </li>)}
    </ul>
  </div>
}
