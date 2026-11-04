"use client"
import type { RefObject } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, CircleAlert } from "lucide-react"
import type { compareInput, TypingSession } from "@/core/typing"
import Kbd from "./Kbd"

export default function TypingInput({ inputRef, session, composition, comparison, simpleKeys, onFocus, onBlur, onRestart, onCompositionStart, onCompositionEnd, onChange }: {
  inputRef: RefObject<HTMLInputElement | null>
  session: TypingSession
  composition: string | null
  comparison: ReturnType<typeof compareInput>
  simpleKeys: [string, string][]
  onFocus: () => void
  onBlur: () => void
  onRestart: () => void
  onCompositionStart: () => void
  onCompositionEnd: (value: string) => void
  onChange: (value: string, isComposing: boolean) => void
}) {
  const t = useTranslations('practice')
  const hasError = comparison.errorIndex >= 0
  const feedback = hasError
    ? <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{t('feedback.mismatch', { position: comparison.errorIndex + 1 })}</span>
    : composition !== null ? <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
      <span className="text-base text-foreground underline decoration-dotted underline-offset-4">{composition.startsWith(session.input) ? composition.slice(session.input.length) : composition}</span>{t('feedback.composing')}
    </span>
    : <span className="hidden items-center gap-1.5 sm:inline-flex"><Kbd>Esc</Kbd>{t('feedback.restart')}</span>
  return <div className="relative flex flex-col items-center gap-2.5 px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
    {/* No visible field: the word itself shows the progress. This input only takes the keys, including IME composition
        and on-screen keyboards, and always holds the correct characters typed so far. */}
    <input ref={inputRef} id="wordInputField" value={composition ?? session.input} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
      aria-label={t('word.inputLabel')} aria-invalid={hasError} aria-describedby="practice-feedback"
      className="absolute top-0 left-1/2 size-px overflow-hidden border-0 bg-transparent p-0 text-transparent caret-transparent opacity-0 outline-none"
      onPaste={event => event.preventDefault()} onDrop={event => event.preventDefault()}
      // Input only grows at the end: a click or tap on the field would leave the caret earlier, and a key typed
      // there would make the characters after it count as new input (and as mistakes) again. Text being composed by an
      // input method is left alone: its caret belongs to the IME.
      onSelect={event => {
        const field = event.currentTarget
        const end = field.value.length
        if (composition !== null || field.value !== session.input) return
        if (field.selectionStart !== end || field.selectionEnd !== end) field.setSelectionRange(end, end)
      }}
      onFocus={onFocus} onBlur={onBlur}
      onKeyDown={event => { if (event.key === 'Escape' && composition === null && !event.nativeEvent.isComposing) { event.preventDefault(); onRestart() } }}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={event => onCompositionEnd(event.currentTarget.value)}
      onChange={event => onChange(event.target.value, (event.nativeEvent as InputEvent).isComposing)} />
    <p id="practice-feedback" aria-live="polite" className="flex min-h-5 flex-wrap items-center justify-center text-xs text-muted-foreground">{feedback}</p>
    {simpleKeys.length > 0 && <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span>{t('word.simpleKeys')}</span>
      <dl className="contents">
        {simpleKeys.map(([char, key]) => <div key={char} className="inline-flex items-center gap-1">
          <dt className="text-sm text-foreground" lang="und">{char}</dt>
          <ArrowRight className="size-3" aria-hidden="true" />
          <dd><Kbd className="font-mono">{key}</Kbd></dd>
        </div>)}
      </dl>
      <Link href="/input" className="rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{t('word.simpleKeysAll')}</Link>
    </div>}
  </div>
}
