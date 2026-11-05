import type { Metadata } from "next"
import { pageMetadata } from "@/lib/pageMetadata"

// The page is a client component, so its title and description are set here.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("interests", { personal: true })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
