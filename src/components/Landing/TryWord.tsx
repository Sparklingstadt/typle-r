"use client"
import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import TargetText from "@/components/Practice/TargetText"
import { useOfficialPackStart } from "@/lib/useOfficialPackStart"
import { useWordLists } from "@/lib/useWordLists"
import { compareInput } from "@/core/typing"

export type TryWordItem = { input: string; meaning: string }

// The landing page's hero: a word of an official pack typed right there, before any choice. A finished word gives way
// to the next; the button goes on to the same pack on /play (following it). Nothing typed here is recorded.
export default function TryWord({ catalogId, packName, total, words }: { catalogId: string; packName: string; total: number; words: TryWordItem[] }) {
  const t = useTranslations("landing.try")
  const inputId = useId()
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState("")
  const [done, setDone] = useState(0)
  const { ready, saving } = useWordLists()
  const { start, starting } = useOfficialPackStart()
  const word = words[index % words.length]
  const { characters, states, extra, errorIndex } = compareInput(word.input, typed)

  function change(value: string) {
    if (value === word.input) {
      setIndex(index + 1)
      setDone(done + 1)
      setTyped("")
      return
    }
    setTyped(value)
  }

  return <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-xs sm:p-7">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[13px] font-bold text-primary">{t("badge")}</span>
      <span className="text-[13px] tabular-nums text-muted-foreground">{t("progress", { name: packName, current: (index % words.length) + 1, total })}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${((index % words.length) + 1) / total * 100}%` }} />
    </div>
    <div className="space-y-1 py-2 text-center">
      <TargetText id={`${inputId}-target`} characters={characters} states={states} extra={extra} className="text-[40px] leading-tight sm:text-[52px]" />
      <p className="text-muted-foreground">{word.meaning}</p>
    </div>
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium">{t("label")}</label>
      <input id={inputId} value={typed} onChange={event => change(event.target.value)} aria-describedby={`${inputId}-target`} aria-invalid={errorIndex >= 0}
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} lang="en"
        className="h-12 w-full rounded-lg border-2 border-input bg-background px-4 font-mono text-xl outline-none focus-visible:border-primary aria-invalid:border-destructive" />
    </div>
    <p aria-live="polite" className="min-h-5 text-[13px] text-muted-foreground">{done > 0 ? t("done", { count: done }) : t("hint")}</p>
    <Button size="lg" variant={done > 0 ? "default" : "outline"} className="w-full" disabled={!ready || saving || starting !== null} onClick={() => void start(catalogId)}>
      {starting ? t("starting") : t("continue")}<ArrowRight aria-hidden="true" />
    </Button>
  </div>
}
