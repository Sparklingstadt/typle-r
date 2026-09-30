import AccountBar from "@/components/AccountBar"
import ThemeSwitcher from "@/components/ThemeSwitcher"
import Brand from "@/components/Navbar/Brand"
import MobileNav from "@/components/Navbar/MobileNav"
import StorageBadge from "@/components/Navbar/StorageBadge"

export default function Navbar(){
  return (
    <header className="sticky top-0 z-40 h-14 w-full border-b bg-background" aria-label="トップバー">
      <a href="#main-content" className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">本文へスキップ</a>
      <div className="flex h-full items-center gap-1 px-2 sm:px-4">
        <MobileNav />
        <Brand />
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <StorageBadge className="hidden sm:inline-flex" />
          <ThemeSwitcher />
          <AccountBar />
        </div>
      </div>
    </header>
  )
}
