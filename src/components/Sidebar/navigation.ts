import { BookOpen, ExternalLink, History, House, Info, Keyboard, LayoutGrid, List, Monitor, Plus, Settings, Sparkles, TableProperties, TextCursorInput, Trophy, type LucideIcon } from "lucide-react"
import type nav from "@/messages/ja/nav.json"

// Names are keys of the `nav` messages; each matches its page's heading so the sidebar and the page read the same.
export type NavLink = { name: keyof typeof nav.links; path: string; icon: LucideIcon; external?: boolean }
export type NavGroup = { label?: keyof typeof nav.groups; links: NavLink[] }

export const mainNavigation: NavGroup[] = [
  { links: [{ name: "home", path: "/home", icon: House }] },
  { label: "practice", links: [
    { name: "play", path: "/play", icon: Keyboard },
    { name: "records", path: "/records", icon: History },
    { name: "rankings", path: "/rankings", icon: Trophy },
  ] },
  { label: "wordLists", links: [
    { name: "edit", path: "/edit", icon: List },
    { name: "words", path: "/words", icon: TableProperties },
    { name: "create", path: "/packs/create", icon: Plus },
    { name: "gallery", path: "/gallery", icon: LayoutGrid },
  ] },
  { label: "settings", links: [
    { name: "general", path: "/settings", icon: Settings },
    { name: "input", path: "/input", icon: TextCursorInput },
    { name: "interests", path: "/interests", icon: Sparkles },
    { name: "devices", path: "/devices", icon: Monitor },
  ] },
]

export const helpNavigation: NavLink[] = [
  { name: "guide", path: "/guide", icon: BookOpen },
  { name: "about", path: "/about", icon: Info },
  { name: "github", path: "https://github.com/Sparklingstadt/typle-r", icon: ExternalLink, external: true },
]

export const isCurrentPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`)
