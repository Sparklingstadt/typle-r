"use client"
import { Cloud, HardDrive, type LucideIcon } from "lucide-react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const places: { key: "browser" | "account"; icon: LucideIcon }[] = [
  { key: "browser", icon: HardDrive },
  { key: "account", icon: Cloud },
]
const points = ["p1", "p2", "p3"] as const

/** The two storage places side by side, marking the one in use once the session is known. */
export default function StorageComparison() {
  const t = useTranslations("about.places")
  const { data: session, status } = useSession()
  const current = status === "loading" ? null : session?.user ? "account" : "browser"
  return <ul className="grid gap-3 sm:grid-cols-2">
    {places.map(({ key, icon: Icon }) => {
      const active = key === current
      return <li key={key} aria-current={active ? "true" : undefined}
        className={cn("rounded-xl border bg-card p-4", active && "border-foreground/40 ring-1 ring-foreground/40")}>
        <div className="mb-3 flex items-start gap-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold">{t(`${key}.title`)}</h3>
            <p className="text-xs text-muted-foreground">{t(`${key}.condition`)}</p>
          </div>
          {active && <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground">{t("current")}</span>}
        </div>
        <ul className="space-y-1.5 text-sm">
          {points.map(point => <li key={point} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />{t(`${key}.${point}`)}
          </li>)}
        </ul>
      </li>
    })}
  </ul>
}
