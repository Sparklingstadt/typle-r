"use client"
import { Cloud, HardDrive, type LucideIcon } from "lucide-react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"

const places: { key: "browser" | "account"; title: string; condition: string; icon: LucideIcon; points: string[] }[] = [
  { key: "browser", title: "このブラウザー", condition: "ログインしていないとき", icon: HardDrive, points: [
    "このブラウザーのLocalStorageに保存します",
    "別の端末やブラウザーとは同期しません",
    "ブラウザーのデータを削除すると消えます",
  ] },
  { key: "account", title: "アカウント", condition: "GitHubでログインしているとき", icon: Cloud, points: [
    "アカウント専用のサーバーに保存します",
    "ログインした端末で同じデータを使えます",
    "保存にはインターネット接続が必要です",
  ] },
]

/** The two storage places side by side, marking the one in use once the session is known. */
export default function StorageComparison() {
  const { data: session, status } = useSession()
  const current = status === "loading" ? null : session?.user ? "account" : "browser"
  return <ul className="grid gap-3 sm:grid-cols-2">
    {places.map(({ key, title, condition, icon: Icon, points }) => {
      const active = key === current
      return <li key={key} aria-current={active ? "true" : undefined}
        className={cn("rounded-xl border bg-card p-4", active && "border-foreground/40 ring-1 ring-foreground/40")}>
        <div className="mb-3 flex items-start gap-3">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-muted-foreground">{condition}</p>
          </div>
          {active && <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground">今の保存先</span>}
        </div>
        <ul className="space-y-1.5 text-sm">
          {points.map(point => <li key={point} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />{point}
          </li>)}
        </ul>
      </li>
    })}
  </ul>
}
