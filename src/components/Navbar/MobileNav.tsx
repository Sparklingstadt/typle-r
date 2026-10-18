"use client"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import Brand from "@/components/Navbar/Brand"
import StorageBadge from "@/components/Navbar/StorageBadge"
import NavList from "@/components/Sidebar/NavList"

/** Below 1280px the sidebar becomes a modal drawer: Esc, the backdrop or a link closes it and focus returns to the menu button. */
export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const t = useTranslations("nav")
  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia("(min-width: 1280px)")
    const close = () => { if (desktop.matches) setOpen(false) }
    desktop.addEventListener("change", close)
    return () => desktop.removeEventListener("change", close)
  }, [open])
  const close = () => setOpen(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-10 xl:hidden" aria-label={t("openMenu")}>
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 overflow-y-auto bg-background px-3 pt-2 pb-3 shadow-xl outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left motion-reduce:animate-none">
          <Dialog.Title className="sr-only">{t("menu")}</Dialog.Title>
          <div className="flex items-center justify-between gap-2">
            <Brand onNavigate={close} />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="size-10" aria-label={t("closeMenu")}><X aria-hidden="true" className="size-5" /></Button>
            </Dialog.Close>
          </div>
          <StorageBadge className="self-start" />
          <div className="flex-1"><NavList onNavigate={close} /></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
