import NavbarList from "./NavbarList";
import AccountBar from "@/components/AccountBar";
import Link from "next/link";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function Navbar(){
  return (
    <header className="w-full bg-background border-b" aria-label="トップバー">
      <div className="flex min-h-18 items-center gap-4 px-3 py-3 sm:px-6">
        <Link href="/" className="shrink-0 rounded-sm text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4">Typle</Link>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <NavbarList />
          <ThemeSwitcher />
          <AccountBar />
        </div>
      </div>
    </header>
  )
}
