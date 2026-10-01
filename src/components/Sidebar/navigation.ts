import { BookOpen, ExternalLink, History, House, Info, Keyboard, List, Monitor, Plus, Trophy, UsersRound, type LucideIcon } from "lucide-react"

export type NavLink = { name: string; path: string; icon: LucideIcon; external?: boolean }
export type NavGroup = { label?: string; links: NavLink[] }

// Link names match each page's heading so the sidebar and the page read the same.
export const mainNavigation: NavGroup[] = [
  { links: [{ name: "ホーム", path: "/home", icon: House }] },
  { label: "練習", links: [
    { name: "練習する", path: "/play", icon: Keyboard },
    { name: "練習記録", path: "/records", icon: History },
    { name: "ベスト記録", path: "/rankings", icon: Trophy },
  ] },
  { label: "単語リスト", links: [
    { name: "単語リスト", path: "/edit", icon: List },
    { name: "リストを作成", path: "/create", icon: Plus },
  ] },
  { label: "設定", links: [
    { name: "プロファイル", path: "/profiles", icon: UsersRound },
    { name: "端末", path: "/devices", icon: Monitor },
  ] },
]

export const helpNavigation: NavLink[] = [
  { name: "使い方", path: "/guide", icon: BookOpen },
  { name: "Typleについて", path: "/about", icon: Info },
  { name: "GitHub", path: "https://github.com/Sparklingstadt/typle-r", icon: ExternalLink, external: true },
]

export const isCurrentPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`)
