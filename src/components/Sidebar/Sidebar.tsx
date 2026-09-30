import NavList from "@/components/Sidebar/NavList"

/** Desktop (1024px and wider): stays below the top bar while the page scrolls. Smaller screens use the drawer in the top bar. */
export default function Sidebar() {
  return (
    <div id="sidebar" className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-background p-3 lg:block">
      <NavList />
    </div>
  )
}
