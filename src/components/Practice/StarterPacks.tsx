"use client"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Keyboard } from "lucide-react"
import { ErrorAlert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useWordLists } from "@/lib/useWordLists"
import { useOfficialPackStart } from "@/lib/useOfficialPackStart"
import { starterPacks } from "@/plugins/packs/starters"

const SAMPLE_WORDS = 3

// /play for someone with no pack yet: a few official packs to start with, each showing the words of its first list.
// Choosing one follows it and starts its first list at once. The first pack is the suggested one.
export default function StarterPacks({ error }: { error: string }) {
  const t = useTranslations("practice.starter")
  const pack = useTranslations("officialPack")
  const { ready, saving } = useWordLists()
  const { start, starting } = useOfficialPackStart()

  return <main className="mx-auto my-6 w-11/12 max-w-7xl pb-12 sm:my-8">
    {error && <ErrorAlert className="mb-4">{error}</ErrorAlert>}
    <section aria-labelledby="starter-title" className="space-y-6">
      <div className="space-y-2">
        <h1 id="starter-title" className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-base text-muted-foreground">{t("description")}</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {starterPacks().map((entry, index) => {
          const first = entry.lists[0]
          const words = entry.lists.reduce((total, list) => total + list.words.length, 0)
          const nameId = `starter-${entry.catalogId}`
          return <li key={entry.catalogId} data-catalog-id={entry.catalogId}>
            <Card className="h-full gap-3 px-5 py-5">
              <p className="text-[13px] text-muted-foreground">{pack("stats", { lists: entry.lists.length, words })}</p>
              <h2 id={nameId} className="text-lg font-bold">{entry.pack.name}</h2>
              <p className="text-[13px] text-muted-foreground">{t("first", { list: first?.name ?? "" })}</p>
              <ul className="space-y-1 font-mono text-[15px]">
                {first?.words.slice(0, SAMPLE_WORDS).map((word, wordIndex) => <li key={wordIndex}>{word.display}</li>)}
              </ul>
              <Button className="mt-auto" variant={index === 0 ? "default" : "outline"} aria-describedby={nameId}
                disabled={!ready || saving || starting !== null} onClick={() => void start(entry.catalogId)}>
                <Keyboard aria-hidden="true" />{starting === entry.catalogId ? pack("preparing") : t("start")}
              </Button>
            </Card>
          </li>
        })}
      </ul>
      <p className="text-base">{t.rich("more", {
        catalog: chunks => <Link href="/packs/catalog" className="underline">{chunks}</Link>,
        create: chunks => <Link href="/packs/create" className="underline">{chunks}</Link>,
      })}</p>
    </section>
  </main>
}
