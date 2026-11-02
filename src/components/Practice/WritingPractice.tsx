"use client"
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { CircleAlert, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Kbd from '@/components/Practice/Kbd'
import LiveStats from '@/components/Practice/LiveStats'
import PracticeResult from '@/components/Practice/PracticeResult'
import PracticeProgress from '@/components/Practice/PracticeProgress'
import PracticeText from '@/components/Practice/PracticeText'
import type { PracticeDevice } from '@/core/devices'
import { typingSpeed } from '@/core/typing'
import type { SavedWordList } from '@/core/wordLists'
import type { RecordSave } from '@/lib/useWordLists'
import { useWritingPractice } from '@/lib/useWritingPractice'

export type WritingRun = { index: number; device?: PracticeDevice }

// The body of the practice card in Typle Writing: the word as a model, a field the OS handwriting input writes into,
// 判定 and 飛ばす. Remounted (key) for every new run, so each starts afresh.
export default function WritingPractice({ list, listName, records, addRecord, device, statsVisible, onRun, onRestart, onChooseList }: {
  list: SavedWordList
  listName: string
  // The list's records; the result compares the run with its writing records only.
  records: SavedWordList['records']
  addRecord: RecordSave
  device?: PracticeDevice
  statsVisible: boolean
  // The run while it is going (after the first input, before the last word), null otherwise.
  onRun: (run: WritingRun | null) => void
  onRestart: () => void
  onChooseList: () => void
}) {
  const t = useTranslations('practice')
  const { session, word, finished, result, language, practiceDevice, record, saveState, input, value, read, change, submit, skip, startComposition, endComposition, pause, resume, retrySave } = useWritingPractice(list, addRecord, device)
  const words = list.words
  const running = session.startedAt !== null && !finished

  useEffect(() => {
    onRun(running ? { index: session.index, device: practiceDevice } : null)
    return () => onRun(null)
  }, [onRun, running, session.index, practiceDevice])

  const progress = <PracticeProgress index={session.index} total={words.length} finished={finished} />
  if (finished) return <>{progress}<PracticeResult mode="writing" listName={listName} wordCount={words.length} result={result} correct={session.attempts - session.mistakes}
    speed={typingSpeed(session, 0)} device={practiceDevice} record={record} records={records} saveState={saveState}
    onRestart={onRestart} onRetry={retrySave} onChooseList={onChooseList} /></>

  return <>
    {progress}
    <div key={session.index} lang={language} className="flex min-h-44 flex-1 flex-col items-center justify-center gap-3 px-4 pt-6 pb-2 text-center sm:min-h-52 sm:gap-3.5 sm:px-6 sm:pt-11">
      {word?.annotation && <p className="max-w-full text-base break-words text-foreground">{word.annotation}</p>}
      {word && <PracticeText id="wordDisplay" text={word.display} />}
    </div>
    <div className="flex flex-col items-center gap-2.5 px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
      <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-2">
        <input ref={input} id="writingInputField" lang={language} value={value}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          aria-label={t('writingInput')} placeholder={t('writingInput')} aria-describedby="writing-feedback"
          className="h-12 min-w-0 flex-1 basis-60 rounded-lg border bg-background px-3 text-center text-xl outline-none placeholder:text-base placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          onFocus={resume} onBlur={pause}
          onKeyDown={event => {
            // Safari ends composition before the Enter that confirms it, which then reports keyCode 229.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === 'Enter') { event.preventDefault(); submit() }
            else if (event.key === 'Escape') { event.preventDefault(); onRestart() }
          }}
          onCompositionStart={startComposition}
          onCompositionEnd={event => endComposition(event.currentTarget.value)}
          onChange={event => change(event.target.value, (event.nativeEvent as InputEvent).isComposing)} />
        <Button size="lg" className="h-12" onClick={submit} aria-label={t('writingJudge')} aria-keyshortcuts="Enter">{t('writingJudge')}<Kbd className="hidden sm:inline-flex">Enter</Kbd></Button>
        <Button variant="outline" size="lg" className="h-12" onClick={skip}><SkipForward aria-hidden="true" />{t('writingSkip')}</Button>
      </div>
      <p id="writing-feedback" aria-live="polite" className="flex min-h-5 flex-wrap items-center justify-center text-xs text-muted-foreground">
        {read !== null
          ? <span key={session.mistakes} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{t('writingRead', { text: read })}</span>
          : <span className="hidden items-center gap-1.5 sm:inline-flex"><Kbd>Esc</Kbd>{t('feedback.restart')}</span>}
      </p>
    </div>
    {statsVisible && <LiveStats mode="writing" session={session} accuracy={result.accuracy} />}
  </>
}
