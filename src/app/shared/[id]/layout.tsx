import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

// A share link is an unlisted capability URL: keep it out of search indexes and describe it generically, never by the pack.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata")
  const title = t("sharedTitle")
  return { title, robots: { index: false, follow: false }, openGraph: { title }, twitter: { title } }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
