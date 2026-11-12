"use client"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ListRestart } from "lucide-react"
import { Button } from "@/components/ui/button"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import { wordMeaning } from "@/core/landing"
import type { WeakList } from "@/core/dashboard"

const SHOWN_WORDS = 6

// The home screen's weak words: for each list with some, the words missed most in its latest runs and a button that
// practises only them (not recorded, as any review).
export default function WeakWords({ items }: { items: WeakList[] }) {
  const t = useTranslations("dashboard.weak")
  const practiceName = usePracticeName()
  if (!items.length) return <p className="rounded-xl p-4 text-sm ring-1 ring-foreground/10">{t("none")}</p>
  return <ul className="flex flex-col gap-4">
    {items.map(({ list, words }) => {
      const rest = words.length - SHOWN_WORDS
      return <li key={list.id} className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10 sm:px-5">
        <p className="font-medium break-words"><PracticeName list={list} /></p>
        <ul aria-label={t("wordsOf", { name: practiceName(list) })} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {words.slice(0, SHOWN_WORDS).map(({ word, runs }) => {
            const meaning = word.annotation ? wordMeaning(word.display, word.annotation) : ""
            return <li key={word.input} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="min-w-0">
                <span lang="und" className="block truncate font-mono">{word.display === word.input ? word.input : `${word.display} ${word.input}`}</span>
                {meaning && <span className="block truncate text-[13px] text-muted-foreground">{meaning}</span>}
              </span>
              <span className="shrink-0 text-[13px] font-bold text-red-700 tabular-nums dark:text-red-400">{t("runs", { count: runs })}</span>
            </li>
          })}
        </ul>
        {rest > 0 && <p className="text-[13px] text-muted-foreground">{t("more", { count: rest })}</p>}
        <div>
          <Button asChild variant="outline">
            <Link href={`/play?list=${encodeURIComponent(list.id)}&review=weak`} aria-label={t("practiceList", { name: practiceName(list), count: words.length })}>
              <ListRestart aria-hidden="true" />{t("practice", { count: words.length })}
            </Link>
          </Button>
        </div>
      </li>
    })}
  </ul>
}
