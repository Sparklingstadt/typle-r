import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

// The gallery is public but not worth indexing: its packs come and go, and a search page is not a landing page.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata")
  const title = t("galleryTitle")
  return { title, robots: { index: false, follow: false }, openGraph: { title }, twitter: { title } }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
