import type { Metadata } from "next"
import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { defaultLocale, isLocale, type Locale } from "@/i18n/config"
import { fromSharedQuery, toSharedQuery } from "@/core/sharedResult"
import { sharedResultMode, sharedResultTiles } from "@/lib/sharedResultView"

// A practice result someone shared on X. The link carries the result itself; nothing is stored. The page is kept out
// of search (every link is a different page with little on it), and its social card is drawn by /result/image.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function currentLocale(): Promise<Locale> {
  const locale = await getLocale()
  return isLocale(locale) ? locale : defaultLocale
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const result = fromSharedQuery(await searchParams)
  const t = await getTranslations("sharedResult")
  const robots = { index: false, follow: true }
  if (!result) return { title: `${t("invalidTitle")} | Typle`, robots }
  const title = `${t("title", { name: result.name })} | Typle`
  const description = t("description", { time: result.time.toFixed(2), accuracy: result.accuracy })
  const image = { url: `/result/image?${toSharedQuery(result)}&l=${await currentLocale()}`, width: 1200, height: 630, alt: title }
  return {
    title, description, robots,
    openGraph: { title, description, type: "website", siteName: "Typle", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export default async function SharedResultPage({ searchParams }: Props) {
  const result = fromSharedQuery(await searchParams)
  const t = await getTranslations("sharedResult")
  if (!result) return <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-10 pb-16 sm:px-6">
    <h1 className="text-2xl font-bold">{t("invalidTitle")}</h1>
    <p className="text-sm text-muted-foreground">{t("invalid")}</p>
    <Button asChild><Link href="/">{t("about")}</Link></Button>
  </main>
  const locale = await currentLocale()
  const tiles = await sharedResultTiles(result, locale)
  const mode = await sharedResultMode(result, locale)
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-10 pb-16 sm:px-6">
    <header className="space-y-3">
      {mode && <span className="inline-flex h-7 items-center rounded-full bg-primary/10 px-2.5 text-[13px] font-bold text-primary">{mode}</span>}
      <h1 className="text-2xl font-bold [overflow-wrap:anywhere] sm:text-3xl">{t("heading", { name: result.name })}</h1>
    </header>
    <dl className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {tiles.map(tile => <div key={tile.label} className="grid min-w-0 content-start gap-0.5 rounded-xl border px-3 py-3 sm:px-4 sm:py-3.5">
        <dt className="text-xs text-muted-foreground">{tile.label}</dt>
        <dd className="text-2xl font-medium tabular-nums sm:text-[28px]">{tile.value}<span className="ml-0.5 text-sm font-normal text-muted-foreground">{tile.unit}</span></dd>
      </div>)}
    </dl>
    <p className="max-w-2xl text-sm text-muted-foreground">{t("lead")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg"><Link href="/play"><Keyboard aria-hidden="true" />{t("play")}</Link></Button>
      <Link href="/" className="text-sm underline underline-offset-3 hover:text-muted-foreground">{t("about")}</Link>
    </div>
  </main>
}
