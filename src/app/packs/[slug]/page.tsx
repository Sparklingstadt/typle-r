import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import OfficialPackPractice from "@/components/OfficialPackPractice"
import { OFFICIAL_PACK_PAGES, officialPackPage } from "@/plugins/packs/pages"
import { PROGRAMMING_CATEGORY } from "@/core/landing"
import { cn } from "@/lib/utils"

// A page for one official pack, built when the app is built, so that a search for its words can find it: its
// description, every word with its note, and a button that follows the pack and starts practice.
type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return OFFICIAL_PACK_PAGES.map(page => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = officialPackPage((await params).slug)
  if (!page) return {}
  const t = await getTranslations("officialPack")
  const title = `${t("title", { name: page.entry.pack.name })} | Typle`
  return {
    title, description: page.description,
    alternates: { canonical: `/packs/${page.canonical ?? page.slug}` },
    openGraph: { title, description: page.description, type: "website", siteName: "Typle" },
  }
}

export default async function OfficialPackPage({ params }: Props) {
  const page = officialPackPage((await params).slug)
  if (!page) notFound()
  const t = await getTranslations("officialPack")
  const { pack, lists } = page.entry
  const words = lists.reduce((sum, list) => sum + list.words.length, 0)
  const code = pack.category === PROGRAMMING_CATEGORY
  return <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
    <header className="mb-10 space-y-4">
      <p className="text-sm text-muted-foreground">{[pack.category, ...(pack.tags ?? [])].filter(Boolean).join(" · ")}</p>
      <h1 className="text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">{t("title", { name: pack.name })}</h1>
      <p className="max-w-2xl text-base text-muted-foreground">{page.description}</p>
      <p className="text-sm tabular-nums text-muted-foreground">{t("stats", { lists: lists.length, words })}</p>
      <OfficialPackPractice catalogId={page.catalogId} />
      <p className="text-[13px] text-muted-foreground">{t("free")}</p>
    </header>

    <section aria-labelledby="words-heading" className="space-y-8">
      <h2 id="words-heading" className="text-lg font-bold">{t("wordsHeading")}</h2>
      {lists.map(list => <div key={list.id} className="space-y-3">
        <h3 className="font-bold">{list.name}</h3>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th scope="col" className="px-4 py-2 font-medium">{t("input")}</th><th scope="col" className="px-4 py-2 font-medium">{t("note")}</th></tr>
            </thead>
            <tbody className="divide-y">
              {list.words.map((word, index) => <tr key={index} className="align-top">
                <td className={cn("px-4 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]", code && "font-mono text-[13px]")}>{word.display}</td>
                <td className="px-4 py-2 text-muted-foreground [overflow-wrap:anywhere]">{word.annotation}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>)}
    </section>

    <p className="mt-10"><Link href="/packs/catalog" className="text-sm underline underline-offset-3 hover:text-muted-foreground">{t("catalog")}</Link></p>
  </main>
}
