"use client"
import { useTranslations } from "next-intl"
import { Eye, MousePointerClick } from "lucide-react"
import { recallDisplayHint, recallPrompt } from "@/core/recallPrompt"
import type { InputComparison } from "@/core/typing"
import type { Word } from "@/core/wordFormat"
import { Button } from "@/components/ui/button"
import PracticeText from "./PracticeText"
import TargetText from "./TargetText"

export default function WordPrompt({ word, recall, comparison, revealed, showResume, onReveal, onResume }: {
  word?: Word
  recall: boolean
  comparison: InputComparison
  revealed?: boolean
  showResume: boolean
  onReveal: () => void
  onResume: () => void
}) {
  const t = useTranslations('practice')
  // Recall mode shows the annotation with the answer hidden and the display text when it differs from what is typed.
  const prompt = recall && word ? recallPrompt(word) : ''
  const displayHint = word && recall ? recallDisplayHint(word) : ''
  return <div className="relative flex min-h-44 flex-1 flex-col items-center justify-center gap-3 px-4 pt-6 pb-2 text-center sm:min-h-52 sm:gap-3.5 sm:px-6 sm:pt-11">
    {recall ? word && <>
      {/* The original annotation is never shown here: it may contain the answer. */}
      {prompt && <p className="max-w-full text-base break-words text-foreground">{prompt}</p>}
      {displayHint && <PracticeText id="wordHint" text={displayHint} className="text-xl leading-[1.75] sm:text-[26px]" />}
      {!prompt && !displayHint && <p className="text-sm text-muted-foreground">{t('recall.noHint')}</p>}
      <TargetText id="wordDisplay" {...comparison} concealed={!revealed} />
      {/* Keeps the focus in the input, so the resume cover does not come up under the pointer and take the click. */}
      <Button variant="outline" size="sm" disabled={!!revealed} onMouseDown={event => event.preventDefault()} onClick={onReveal}><Eye aria-hidden="true" />{t('recall.reveal')}</Button>
    </>
    : <>
    {word?.annotation && <p className="max-w-full text-base break-words text-foreground">{word.annotation}</p>}
    {/* Code is displayed with line breaks and indentation but typed on one line, so showing both would repeat the
        same code. Only the characters to type are shown. */}
    {word && (word.display === word.input || word.input_type === 'code')
      ? <TargetText id="wordDisplay" {...comparison} />
      : word && <>
        <PracticeText id="wordDisplay" text={word.display} />
        <div className="flex w-full min-w-0 flex-col items-center gap-2.5">
          <span className="rounded-full border px-2 text-xs text-muted-foreground">{t('word.typeThis')}</span>
          <TargetText id="wordTarget" {...comparison} guide />
        </div>
      </>}
    </>}
    {showResume && <button type="button" onClick={onResume} className="absolute inset-0 z-10 grid place-items-center bg-card/70 outline-none backdrop-blur-sm">
      <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><MousePointerClick className="size-4" aria-hidden="true" />{t('word.resume')}</span>
    </button>}
  </div>
}
