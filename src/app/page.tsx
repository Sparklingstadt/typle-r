import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Code, Eye, Keyboard, Languages, Library, ListPlus, TrendingUp, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { officialListCounts } from "@/core/landing"
import { initialLists } from "@/plugins/packs"

// The landing page for first-time visitors. It renders on the server so search engines see its words,
// and every visitor sees it: Home (/home) is one link away for people who already use Typle.
const counts = officialListCounts(initialLists)

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta")
  const title = t("title")
  const description = t("description", { total: counts.total })
  return { title, description, alternates: { canonical: "/" } }
}

const packGroups: { key: "programming" | "languages"; icon: LucideIcon; count: number }[] = [
  { key: "programming", icon: Code, count: counts.programming },
  { key: "languages", icon: Languages, count: counts.languages },
]

const features: { key: "own" | "recall" | "records"; icon: LucideIcon }[] = [
  { key: "own", icon: ListPlus },
  { key: "recall", icon: Eye },
  { key: "records", icon: TrendingUp },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="text-lg font-bold">{title}</h2>
    {children}
  </section>
}

export default async function Landing() {
  const t = await getTranslations("landing")
  return <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
    <header className="mb-12 space-y-5">
      <p className="text-sm font-medium text-muted-foreground">{t("hero.eyebrow")}</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("hero.title")}</h1>
      <p className="max-w-2xl text-base text-muted-foreground">{t("hero.lead")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg"><Link href="/play"><Keyboard aria-hidden="true" />{t("hero.play")}</Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/packs/catalog"><Library aria-hidden="true" />{t("hero.catalog")}</Link></Button>
        <Link href="/home" className="text-sm underline underline-offset-3 hover:text-muted-foreground">{t("hero.home")}</Link>
      </div>
    </header>

    <div className="space-y-12">
      <Section id="packs-heading" title={t("packs.title")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("packs.lead", { total: counts.total })}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {packGroups.map(({ key, icon: Icon, count }) => <li key={key} className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Icon className="size-4" /></span>
              <h3 className="font-bold">{t(`packs.${key}.title`)}</h3>
              <span className="ml-auto text-sm tabular-nums text-muted-foreground">{t(`packs.${key}.count`, { count })}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t(`packs.${key}.text`)}</p>
          </li>)}
        </ul>
      </Section>

      <Section id="features-heading" title={t("features.title")}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {features.map(({ key, icon: Icon }) => <li key={key} className="rounded-xl border bg-card p-4">
            <span aria-hidden="true" className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground"><Icon className="size-4" /></span>
            <h3 className="font-bold">{t(`features.${key}.title`)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t(`features.${key}.text`)}</p>
          </li>)}
        </ul>
      </Section>

      <Section id="storage-heading" title={t("storage.title")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("storage.text")}</p>
        <p className="text-sm">{t.rich("storage.more", {
          guide: chunks => <Link href="/guide" className="underline underline-offset-3 hover:text-muted-foreground">{chunks}</Link>,
          about: chunks => <Link href="/about" className="underline underline-offset-3 hover:text-muted-foreground">{chunks}</Link>,
        })}</p>
      </Section>

      <div className="flex flex-wrap gap-3 border-t pt-8">
        <Button asChild size="lg"><Link href="/play"><Keyboard aria-hidden="true" />{t("hero.play")}</Link></Button>
      </div>
    </div>
  </main>
}
