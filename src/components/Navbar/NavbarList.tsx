import NavbarListItem from "./NavbarListItem"

export default function NavbarList(){
  const routes = [
    { title: "ガイド", path: "/guide" },
    { title: "GitHub", path: "https://github.com/Sparklingstadt/typle-r" },
  ]

  const navbarListItems = routes.map((route, index) => {
    return <NavbarListItem key={ index } path={ route.path }>{ route.title }</NavbarListItem>
  })

  return (
    <ul className="flex list-none">
      { navbarListItems }
    </ul>
  )
}
