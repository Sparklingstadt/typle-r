import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { BookOpen, ChevronRight, ExternalLink, Keyboard, Plus, Trophy, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import StorageComparison from "@/components/About/StorageComparison"
import packageJson from "../../../package.json"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about.meta")
  return { title: t("title"), description: t("description") }
}

const features: { key: "create" | "play" | "rankings"; path: string; icon: LucideIcon }[] = [
  { key: "create", path: "/packs/create", icon: Plus },
  { key: "play", path: "/play", icon: Keyboard },
  { key: "rankings", path: "/rankings", icon: Trophy },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="text-base font-bold">{title}</h2>
    {children}
  </section>
}

export default async function About() {
  const t = await getTranslations("about")
  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <header className="mb-10 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t("play")}</Link></Button>
        <Button asChild variant="outline"><Link href="/guide"><BookOpen aria-hidden="true" />{t("guide")}</Link></Button>
      </div>
    </header>

    <div className="space-y-10">
      <Section id="features-heading" title={t("features.title")}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {features.map(({ key, path, icon: Icon }) => <li key={path}
            className="relative flex gap-3 rounded-xl border bg-card p-4 pr-10 transition-colors has-[a:hover]:border-foreground/25 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 sm:block sm:pr-4">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground sm:mb-3"><Icon className="size-4" /></span>
            <div className="min-w-0">
              <h3 className="font-bold">
                <Link href={path} className="outline-none after:absolute after:inset-0 after:rounded-xl">{t(`features.${key}.title`)}</Link>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`features.${key}.description`)}</p>
            </div>
            <ChevronRight aria-hidden="true" className="absolute top-4 right-3 size-4 text-muted-foreground sm:top-6 sm:right-4" />
          </li>)}
        </ul>
      </Section>

      <Section id="storage-heading" title={t("storage.title")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("storage.text")}</p>
        <StorageComparison />
        <p className="text-sm">{t.rich("storage.more", { link: chunks => <Link href="/guide#storage" className="underline underline-offset-3 hover:text-muted-foreground">{chunks}</Link> })}</p>
      </Section>

      <Section id="reports-heading" title={t("reports.title")}>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("reports.text")}</p>
      </Section>

      <Section id="version-heading" title={t("version.title")}>
        <dl className="divide-y rounded-xl border bg-card text-sm">
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">{t("version.version")}</dt>
            <dd className="font-medium tabular-nums">{`v${packageJson.version}`}</dd>
          </div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">{t("version.tech")}</dt>
            <dd>{t("version.techList")}</dd>
          </div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">{t("version.source")}</dt>
            <dd className="space-y-0.5">
              <a href="https://github.com/Sparklingstadt/typle-r" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-3 hover:text-muted-foreground">
                GitHub<span className="sr-only">{t("version.newTab")}</span><ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
              <p className="text-muted-foreground">{t("version.public")}</p>
            </dd>
          </div>
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">{t("version.licenses")}</dt>
            <dd><Link href="/about/licenses" className="font-medium underline underline-offset-3 hover:text-muted-foreground">{t("version.licensesLink")}</Link></dd>
          </div>
        </dl>
      </Section>
    </div>
  </main>
}
