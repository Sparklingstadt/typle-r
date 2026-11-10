"use client"
import Link from "next/link"
import { useId } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { helpNavigation, isCurrentPath, mainNavigation, type NavLink } from "./navigation"
import { version } from "../../../package.json"

// 32px rows on desktop keep the whole sidebar within a 1280×768 screen; the drawer keeps 40px touch targets.
const itemClass = (current: boolean) => cn(
  "relative flex h-10 items-center gap-3 xl:h-8 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
  current
    ? "bg-primary/10 font-medium text-primary before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
    : "text-foreground/80 hover:bg-accent/60 hover:text-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground"
)

function Item({ link, pathname, onNavigate }: { link: NavLink; pathname: string; onNavigate?: () => void }) {
  const t = useTranslations("nav.links")
  const current = !link.external && isCurrentPath(pathname, link.path)
  const Icon = link.icon
  const content = <><Icon aria-hidden="true" /><span className="min-w-0 truncate">{t(link.name)}</span></>
  return <li>
    {link.external
      ? <a href={link.path} className={itemClass(false)} onClick={onNavigate}>{content}</a>
      : <Link href={link.path} className={itemClass(current)} onClick={onNavigate} aria-current={current ? "page" : undefined}>{content}</Link>}
  </li>
}

function GroupLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">{children}</p>
}

/** The sidebar's contents, shared by the desktop sidebar and the mobile drawer. */
export default function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const id = useId()
  const t = useTranslations("nav")
  return <div className="flex min-h-full flex-col gap-4">
    <nav aria-label={t("mainNavigation")}>
      {mainNavigation.map((group, index) => {
        const labelId = `${id}-group-${index}`
        return <div key={group.label ?? index} role={group.label ? "group" : undefined} aria-labelledby={group.label ? labelId : undefined}>
          {group.label && <GroupLabel id={labelId}>{t(`groups.${group.label}`)}</GroupLabel>}
          <ul className="grid gap-0.5">
            {group.links.map(link => <Item key={link.path} link={link} pathname={pathname} onNavigate={onNavigate} />)}
          </ul>
        </div>
      })}
    </nav>
    <nav aria-labelledby={`${id}-help`} className="mt-auto border-t pt-1">
      <GroupLabel id={`${id}-help`}>{t("help")}</GroupLabel>
      <ul className="grid gap-0.5">
        {helpNavigation.map(link => <Item key={link.path} link={link} pathname={pathname} onNavigate={onNavigate} />)}
      </ul>
    </nav>
    <p className="px-3 pb-1 text-xs text-muted-foreground tabular-nums">{`v${version}`}</p>
  </div>
}
