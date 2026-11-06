"use client"
import { useTranslations } from 'next-intl'
import { Eraser, LoaderCircle, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Kbd from '@/components/Practice/Kbd'
import type { WritingLanguage } from '@/core/wordLists'
import { useHandwritingPad } from '@/lib/useHandwritingPad'

// Typle Writing's own handwriting input, for languages the app reads itself: strokes drawn with a pen, a finger or a
// mouse are read in the browser (handwritingRecognizer.ts). A pause in the writing reads it silently (a match moves on,
// as the field's text does); 判定 reads it at once and counts a mistake when it does not match. Remounted for every word.
export default function HandwritingPad({ language, expected, onStart, onRead, onEscape, children }: {
  language: WritingLanguage
  // The word being copied, which the reading may settle on (readHandwriting).
  expected: string
  // The first stroke, which starts the clock.
  onStart: () => void
  onRead: (text: string, explicit: boolean) => void
  // Esc, which starts the list again as it does in the field.
  onEscape: () => void
  // More buttons after 判定 (飛ばす).
  children?: React.ReactNode
}) {
  const t = useTranslations('practice')
  const { canvas, status, strokeCount, read, undo, clear, retry, down, move, up } = useHandwritingPad({ language, expected, onStart, onRead, onEscape })

  return <div className="flex w-full max-w-xl flex-col gap-2">
    <div className="relative rounded-lg bg-background dark:bg-input/30">
      {/* A guide for the middle of the line, behind the writing, and what the pad is for while it is empty. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-1/2 border-t border-dashed border-border" />
      <canvas ref={canvas} id="writingPad" role="img" aria-label={t('writingPad')}
        className="relative block h-44 w-full touch-none rounded-lg border text-foreground select-none sm:h-52"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onContextMenu={event => event.preventDefault()} />
      {strokeCount === 0 && status === 'ready' &&
        <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm text-muted-foreground">{t('writingPadHint')}</p>}
      {status !== 'ready' &&
        <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-background/80 px-4 text-center text-sm text-muted-foreground">
          {status === 'loading'
            ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{t('writingPadLoading')}</>
            : <span className="flex flex-col items-center gap-2">{t('writingPadFailed')}
              <Button variant="outline" size="sm" onClick={retry}>{t('writingPadRetry')}</Button></span>}
        </div>}
    </div>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="lg" className="h-12" onClick={undo} disabled={strokeCount === 0}><Undo2 aria-hidden="true" />{t('writingPadUndo')}</Button>
      <Button variant="outline" size="lg" className="h-12" onClick={clear} disabled={strokeCount === 0}><Eraser aria-hidden="true" />{t('writingPadClear')}</Button>
      <Button size="lg" className="h-12" onClick={() => { void read(true) }} disabled={status !== 'ready'} aria-label={t('writingJudge')} aria-keyshortcuts="Enter">
        {t('writingJudge')}<Kbd className="hidden sm:inline-flex">Enter</Kbd>
      </Button>
      {children}
    </div>
  </div>
}
