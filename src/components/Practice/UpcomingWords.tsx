"use client"
import { useEffect, useRef } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isParagraphWord, oneLineDisplay, upcomingWords } from "@/core/practiceView"
import type { Word } from "@/core/wordFormat"

export default function UpcomingWords({ words, index, showAll, onToggleAll }: {
  words: Word[]
  index: number
  showAll: boolean
  onToggleAll: () => void
}) {
  const t = useTranslations('practice')
  const allWords = useRef<HTMLUListElement>(null)
  const { next, remaining } = upcomingWords(words, index)

  useEffect(() => {
    const box = allWords.current
    const current = box?.querySelector<HTMLElement>('[aria-current="step"]')
    if (box && current) box.scrollTop = current.offsetTop - 48
  }, [showAll, index])

  return <div className="flex min-h-14 flex-wrap items-center gap-2 border-t px-4 py-2.5 sm:pr-3 sm:pl-6">
    <span className="text-xs text-muted-foreground">{t('upcoming.next')}</span>
    {next.map((item, index) => <span key={index} className="inline-flex h-7 max-w-full items-center rounded-full border px-3 text-[13px] text-muted-foreground" title={item.display}><span className="truncate whitespace-pre">{oneLineDisplay(item)}</span></span>)}
    {!next.length && <span className="text-xs text-muted-foreground">{t('upcoming.last')}</span>}
    {remaining > 0 && <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('upcoming.more', { count: remaining })}</span>}
    <span className="flex-1" />
    <Button variant="ghost" size="lg" aria-expanded={showAll} aria-controls="all-words" onClick={onToggleAll}>
      {t('upcoming.showAll')}{showAll ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
    </Button>
    {showAll && <ul id="all-words" ref={allWords} aria-label={t('upcoming.allWords')} className="relative mt-1.5 flex max-h-44 basis-full flex-wrap gap-1.5 overflow-y-auto border-t border-dashed pt-2.5 pb-1">
      {words.map((item, wordIndex) => {
        const done = wordIndex < index
        const display = oneLineDisplay(item)
        const paragraph = isParagraphWord(item)
        return <li key={wordIndex} className={cn('max-w-full', paragraph && 'w-full')}>
          <span aria-current={wordIndex === index ? 'step' : undefined}
            className={cn('min-h-7 max-w-full border px-3 text-[13px] text-muted-foreground',
              paragraph ? 'block rounded-lg py-2 text-left leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]' : 'inline-flex items-center rounded-full break-all whitespace-pre-wrap',
              done && 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
              wordIndex === index && 'border-transparent bg-primary text-primary-foreground')}>
            {display}<span className="sr-only">{t(done ? 'upcoming.done' : wordIndex === index ? 'upcoming.current' : 'upcoming.pending')}</span>
          </span>
        </li>
      })}
    </ul>}
  </div>
}
