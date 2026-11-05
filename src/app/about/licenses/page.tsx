import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ChevronLeft, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import LicenseList from "@/components/About/LicenseList"
import { PageMain } from "@/components/ui/page-layout"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about.licenses.meta")
  return { title: t("title"), description: t("description") }
}

// The licenses of the third-party software Typle ships. scripts/generate-licenses.cjs writes the list and the texts into
// public/licenses on every install and build, so the page reads them from there.
export default async function Licenses() {
  const t = await getTranslations("about.licenses")
  return <PageMain width="narrow">
    <header className="mb-8 space-y-4">
      <Link href="/about" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />{t("back")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <Button asChild variant="outline">
        <a href="/licenses/third-party.txt" target="_blank" rel="noopener"><FileText aria-hidden="true" />{t("fullText")}</a>
      </Button>
    </header>
    <LicenseList />
  </PageMain>
}
