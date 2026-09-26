"use client"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { House, Keyboard, History, Plus, Trophy, Pencil, Monitor } from "lucide-react"

const routes = [
  { name: "ホーム", path: "/home", icon: House },
  { name: "遊ぶ", path: "/play", icon: Keyboard },
  { name: "端末", path: "/devices", icon: Monitor },
  { name: "記録", path: "/records", icon: History },
  { name: "作成", path: "/create", icon: Plus },
  { name: "ベスト記録", path: "/rankings", icon: Trophy },
  { name: "編集", path: "/edit", icon: Pencil },
]

export default function NavList({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname()
  return <nav aria-label="メインナビゲーション"><ul className="grid grid-cols-1 gap-1 p-1 lg:p-3">
    {routes.map(route => <li key={route.path}>
      <Button asChild variant={pathname === route.path ? 'secondary' : 'ghost'} className={`w-full gap-3 ${collapsed ? 'justify-center px-0 lg:justify-start lg:px-4' : 'justify-start'}`}>
        <Link href={route.path} title={route.name} onClick={onNavigate} aria-current={pathname === route.path ? 'page' : undefined}><route.icon aria-hidden="true" /><span className={collapsed ? 'sr-only lg:not-sr-only' : undefined}>{route.name}</span></Link>
      </Button>
    </li>)}
  </ul></nav>
}
