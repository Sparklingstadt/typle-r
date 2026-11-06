import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import DevicesSection from "@/components/Guide/DevicesSection"
import ListsSection from "@/components/Guide/ListsSection"
import PracticeSection from "@/components/Guide/PracticeSection"
import RecordsSection from "@/components/Guide/RecordsSection"
import ShortcutsSection from "@/components/Guide/ShortcutsSection"
import StartSection from "@/components/Guide/StartSection"
import StorageSection from "@/components/Guide/StorageSection"
import { PageMain } from "@/components/ui/page-layout"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide.meta")
  return { title: t("title"), description: t("description") }
}

const contents = ["practice", "lists", "records", "devices", "storage", "shortcuts"] as const

export default async function Guide() {
  const t = await getTranslations("guide")
  return <PageMain width="medium">
    <header className="mb-8 space-y-1">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
    </header>
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:items-start xl:gap-10">
      <nav aria-labelledby="guide-contents" className="mb-10 rounded-xl border bg-card p-4 xl:sticky xl:top-20 xl:order-2 xl:mb-0 xl:border-0 xl:bg-transparent xl:p-0">
        <h2 id="guide-contents" className="mb-2 text-xs font-bold text-muted-foreground">{t("contentsLabel")}</h2>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 xl:grid-cols-1 xl:gap-0 xl:border-l">
          {contents.map(id => <li key={id}>
            <a href={`#${id}`} className="-ml-px flex min-h-9 items-center rounded-md px-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 xl:rounded-none xl:border-l xl:border-transparent xl:px-3 xl:hover:border-foreground xl:hover:bg-transparent">{t(`contents.${id}`)}</a>
          </li>)}
        </ol>
      </nav>

      <div className="min-w-0 space-y-10 text-[15px] leading-[1.75] xl:order-1">
        <StartSection />

        <PracticeSection />

        <ListsSection />

        <RecordsSection />

        <DevicesSection />

        <StorageSection />

        <ShortcutsSection />

        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold">{t("cta.text")}</p>
          <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t("cta.action")}</Link></Button>
        </div>
      </div>
    </div>
  </PageMain>
}
