import NavList from "@/components/Sidebar/NavList"

/** Wide screens (1280px and wider): stays below the top bar while the page scrolls. Narrower windows, such as a laptop split in half, use the drawer in the top bar so the page keeps its width. */
export default function Sidebar() {
  return (
    <div id="sidebar" className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-background p-3 xl:block">
      <NavList />
    </div>
  )
}
