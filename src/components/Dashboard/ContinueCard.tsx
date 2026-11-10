"use client"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import { practiceHref } from "@/components/Dashboard/NextLists"
import { useFormat } from "@/i18n/useFormat"
import type { ContinueList } from "@/core/dashboard"

const SAMPLE_WORDS = 3

// The top of the home screen: the list practised last, its first words and one press to practise it again.
export default function ContinueCard({ item, now }: { item: ContinueList; now: Date }) {
  const t = useTranslations("dashboard.continue")
  const practiceName = usePracticeName()
  const format = useFormat()
  const { list, lastPracticed, best } = item
  const rest = list.words.length - SAMPLE_WORDS
  return <section aria-labelledby="continue-name"><Card className="gap-4 px-5 py-6 sm:px-7">
    <p className="text-[13px] font-bold text-primary">{t("label")}</p>
    <div className="space-y-1.5">
      <h2 id="continue-name" className="text-2xl font-bold break-words"><PracticeName list={list} /></h2>
      <p className="text-sm text-muted-foreground">
        {t("meta", { count: list.words.length, day: format.day(lastPracticed, now) })}
        {best && <> · {t("best", { accuracy: best.accuracy === undefined ? t("notRecorded") : `${best.accuracy}%`, time: best.time.toFixed(2) })}</>}
      </p>
    </div>
    <ul aria-label={t("samples")} className="flex flex-wrap items-center gap-2">
      {list.words.slice(0, SAMPLE_WORDS).map((word, index) => <li key={index} lang="und" className="max-w-full truncate rounded-lg border px-2.5 py-1 font-mono text-[15px]">{word.display}</li>)}
      {rest > 0 && <li className="px-1 text-[13px] text-muted-foreground">{t("more", { count: rest })}</li>}
    </ul>
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg">
        <Link href={practiceHref(list)} aria-label={t("practiceList", { name: practiceName(list) })}><Keyboard aria-hidden="true" />{t("practice")}</Link>
      </Button>
      <Button asChild variant="link"><Link href="/edit">{t("other")}</Link></Button>
    </div>
  </Card></section>
}
