import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, Cloud, Command, HardDrive, History, Keyboard, List, Monitor, Plus, TriangleAlert, Trophy, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColorLegend, GuideSection, Keys, Points, Topic, guideTags } from "@/components/Guide/GuideParts"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide.meta")
  return { title: t("title"), description: t("description") }
}

const contents = ["practice", "lists", "records", "devices", "storage", "shortcuts"] as const

const steps: { icon: LucideIcon; key: "sample" | "create" | "review"; href: string }[] = [
  { icon: Keyboard, key: "sample", href: "/play" },
  { icon: Plus, key: "create", href: "/packs/create" },
  { icon: Trophy, key: "review", href: "/rankings" },
]

const shortcuts: { screen: "practice" | "complete" | "editor"; rows: { keys: string[][]; action: "back" | "restart" | "resume" | "again" | "next" | "move" | "save" }[] }[] = [
  { screen: "practice", rows: [
    { keys: [["Backspace"]], action: "back" },
    { keys: [["Esc"]], action: "restart" },
    { keys: [["anyKey"]], action: "resume" },
  ] },
  { screen: "complete", rows: [{ keys: [["Enter"]], action: "again" }] },
  { screen: "editor", rows: [
    { keys: [["Enter"]], action: "next" },
    { keys: [["Alt", "↑"], ["↓"]], action: "move" },
    { keys: [["Ctrl", "Enter"]], action: "save" },
  ] },
]

export default async function Guide() {
  const t = await getTranslations("guide")
  const rich = (key: Parameters<typeof t.rich>[0]) => t.rich(key, guideTags)
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
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
        <section aria-labelledby="start-heading">
          <h2 id="start-heading" className="mb-3 text-base font-bold">{t("start.title")}</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map(({ icon: Icon, key, href }, index) => <li key={href} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">{index + 1}</span>
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="text-[15px] font-bold leading-6">{t(`start.${key}.title`)}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{t(`start.${key}.text`)}</p>
              <Link href={href} className="mt-auto inline-flex w-fit items-center gap-1 rounded-sm pt-1 text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{t(`start.${key}.action`)}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
            </li>)}
          </ol>
        </section>

        <GuideSection id="practice" icon={Keyboard} title={t("contents.practice")} lead={rich("practice.lead")}>
          <Topic title={t("practice.colors.title")}>
            <ColorLegend />
            <p className="mt-3">{rich("practice.colors.text")}</p>
          </Topic>
          <Topic title={t("practice.flow.title")}>
            <Points>
              <li>{t("practice.flow.p1")}</li>
              <li>{t("practice.flow.p2")}</li>
              <li>{t("practice.flow.p3")}</li>
              <li>{t("practice.flow.p4")}</li>
              <li>{t("practice.flow.p5")}</li>
            </Points>
          </Topic>
          <Topic title={t("practice.choose.title")}>
            <Points>
              <li>{t("practice.choose.p1")}</li>
              <li>{t("practice.choose.p2")}</li>
              <li>{rich("practice.choose.p3")}</li>
              <li>{rich("practice.choose.p4")}</li>
            </Points>
          </Topic>
        </GuideSection>

        <GuideSection id="lists" icon={List} title={t("contents.lists")} lead={rich("lists.lead")}>
          <Topic title={t("lists.packs.title")}>
            <Points>
              <li>{t("lists.packs.p1")}</li>
              <li>{t("lists.packs.p2")}</li>
              <li>{t("lists.packs.p3")}</li>
              <li>{t("lists.packs.p4")}</li>
            </Points>
          </Topic>
          <Topic title={t("lists.input.title")}>
            <Points>
              <li>{t("lists.input.p1")}</li>
              <li>{t("lists.input.p2")}</li>
              <li>{rich("lists.input.p3")}</li>
              <li>{rich("lists.input.p4")}</li>
            </Points>
          </Topic>
          <Topic title={t("lists.cannotSave.title")}>
            <Points>
              <li>{t("lists.cannotSave.p1")}</li>
              <li>{t("lists.cannotSave.p2")}</li>
              <li>{t("lists.cannotSave.p3")}</li>
              <li>{rich("lists.cannotSave.p4")}</li>
            </Points>
          </Topic>
          <Topic title={t("lists.manage.title")}>
            <Points>
              <li>{rich("lists.manage.p1")}</li>
              <li>{t("lists.manage.p2")}</li>
              <li>{t("lists.manage.p3")}</li>
            </Points>
          </Topic>
          <Topic title={t("lists.csv.title")}>
            <Points>
              <li>{t("lists.csv.p1")}</li>
              <li>{t("lists.csv.p2")}</li>
              <li>{t("lists.csv.p3")}</li>
            </Points>
            <pre aria-label={t("lists.csv.exampleLabel")} className="mt-3 overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-[13px] leading-6">{t("lists.csv.example")}</pre>
          </Topic>
        </GuideSection>

        <GuideSection id="records" icon={History} title={t("contents.records")} lead={t("records.lead")}>
          <Topic title={t("records.complete.title")}>
            <Points>
              <li>{t("records.complete.p1")}</li>
              <li>{t("records.complete.p2")}</li>
              <li>{t("records.complete.p3")}</li>
              <li>{rich("records.complete.p4")}</li>
            </Points>
          </Topic>
          <Topic title={t("records.history.title")}>
            <Points>
              <li>{rich("records.history.p1")}</li>
              <li>{t("records.history.p2")}</li>
              <li>{t("records.history.p3")}</li>
            </Points>
          </Topic>
          <Topic title={t("records.best.title")}>
            <Points>
              <li>{rich("records.best.p1")}</li>
              <li>{t("records.best.p2")}</li>
              <li>{t("records.best.p3")}</li>
            </Points>
          </Topic>
          <Topic title={t("records.wordCount.title")}>
            <Points>
              <li id="word-count">{t("records.wordCount.p1")}</li>
              <li>{t("records.wordCount.p2")}</li>
            </Points>
          </Topic>
          <Topic title={t("records.home.title")}>
            <p>{rich("records.home.text")}</p>
          </Topic>
        </GuideSection>

        <GuideSection id="devices" icon={Monitor} title={t("contents.devices")} lead={rich("devices.lead")}>
          <Points>
            <li>{t("devices.p1")}</li>
            <li>{t("devices.p2")}</li>
            <li>{t("devices.p3")}</li>
          </Points>
        </GuideSection>

        <GuideSection id="storage" icon={HardDrive} title={t("contents.storage")} lead={t("storage.lead")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { icon: HardDrive, place: "browser" },
              { icon: Cloud, place: "account" },
            ] as const).map(({ icon: Icon, place }) => <div key={place} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                <div>
                  <h3 className="text-[15px] font-bold leading-6">{t(`storage.${place}.title`)}</h3>
                  <p className="text-xs text-muted-foreground">{t(`storage.${place}.when`)}</p>
                </div>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-muted-foreground/60">{(["p1", "p2"] as const).map(point => <li key={point}>{t(`storage.${place}.${point}`)}</li>)}</ul>
            </div>)}
          </div>
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <TriangleAlert className="mt-1 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <h3 className="text-[15px] font-bold leading-6">{t("storage.warning.title")}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-amber-600/60">
                <li>{t("storage.warning.p1")}</li>
                <li>{t("storage.warning.p2")}</li>
              </ul>
            </div>
          </div>
          <Points>
            <li>{t("storage.notes.p1")}</li>
            <li>{rich("storage.notes.p2")}</li>
            <li>{t("storage.notes.p3")}</li>
          </Points>
        </GuideSection>

        <GuideSection id="shortcuts" icon={Command} title={t("contents.shortcuts")} lead={t("shortcuts.lead")}>
          <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
            {shortcuts.map(group => <div key={group.screen}>
              <h3 className="bg-muted/50 px-4 py-2 text-xs font-bold text-muted-foreground">{t(`shortcuts.screens.${group.screen}`)}</h3>
              <dl className="divide-y">
                {group.rows.map(row => <div key={row.action} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <dt className="flex flex-wrap items-center gap-x-2 gap-y-1">{row.keys.map((keys, index) => <span key={index} className="inline-flex items-center gap-2">{index > 0 && <span className="text-xs text-muted-foreground">/</span>}<Keys keys={keys.map(key => key === "anyKey" ? t("shortcuts.anyKey") : key)} /></span>)}</dt>
                  <dd>{t(`shortcuts.actions.${row.action}`)}</dd>
                </div>)}
              </dl>
            </div>)}
          </div>
        </GuideSection>

        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-bold">{t("cta.text")}</p>
          <Button asChild><Link href="/play"><Keyboard aria-hidden="true" />{t("cta.action")}</Link></Button>
        </div>
      </div>
    </div>
  </main>
}
