import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { PracticeDevice } from "@/core/devices"
import { useChosenDevice } from "@/lib/deviceSelection"
import { useLiveStatsVisible } from "@/lib/liveStats"
import { usePracticeMode } from "@/lib/practiceMode"
import { usePlayAsideOpen } from "@/lib/playAside"
import { useTypingOptions } from "@/lib/inputSettings"
import { ErrorAlert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { type RecordSave } from "@/lib/useWordLists"
import type { SavedWordList } from "@/core/wordLists"
import { usePractice } from "@/lib/usePractice"
import { usePracticeSwitch } from "@/lib/usePracticeSwitch"
import { usePracticeFocus } from "@/lib/usePracticeFocus"
import { compareInput, simpleInputKeys, typingSpeed } from "@/core/typing"
import { comparableRecords, recordsOfMode, type PracticeMode } from "@/core/records"
import { practiceMode as writingChoiceFor, useWritingMode, type WritingChoice } from "@/lib/writingMode"
import { currentMode } from "@/core/practiceView"
import { useListChoosers } from "@/lib/useListChoosers"
import type { WordPack } from "@/core/wordPacks"
import { cn } from "@/lib/utils"
import PracticeHeader from "@/components/Practice/PracticeHeader"
import WordPrompt from "@/components/Practice/WordPrompt"
import TypingInput from "@/components/Practice/TypingInput"
import UpcomingWords from "@/components/Practice/UpcomingWords"
import BestRecordsCard from "@/components/Practice/BestRecordsCard"
import ListChooserAside from "@/components/Practice/ListChooserAside"
import ListPickerDialog from "@/components/Practice/ListPickerDialog"
import SwitchConfirmDialog from "@/components/Practice/SwitchConfirmDialog"
import { usePracticeName } from "@/components/PracticeName"
import PracticeResult from "@/components/Practice/PracticeResult"
import PracticeProgress from "@/components/Practice/PracticeProgress"
import LiveStats from "@/components/Practice/LiveStats"
import ModeToggle from "@/components/Practice/ModeToggle"
import WritingPractice, { type WritingRun } from "@/components/Practice/WritingPractice"

const WRITING_CHOICES = ['normal', 'writing'] as const

// The practice card, its list choosers and its confirmations. Remounted per account, so nothing carries over between them.
export default function PracticeScreen({ wordLists, packs, listId, error, addRecord, devices, accountId }: {
  devices: PracticeDevice[]
  accountId: string
  wordLists: SavedWordList[]
  packs: WordPack[]
  listId: string | null
  error: string
  addRecord: RecordSave
}) {
  const t = useTranslations('practice')
  const practiceName = usePracticeName()
  const [device, chooseDevice] = useChosenDevice(accountId, devices)
  const [statsVisible, setStatsVisible] = useLiveStatsVisible()
  const [asideOpen, setAsideOpen] = usePlayAsideOpen()
  const typingOptions = useTypingOptions()
  const [chosenMode, chooseRecall] = usePracticeMode()
  const { list, review, selected, session, practiceDevice, practiceMode, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart: restartPractice, retrySave, pause, resume, reveal } = usePractice(wordLists, addRecord, device, listId, chosenMode)
  const [displayRun, setDisplayRun] = useState(0)
  // Typing or writing is decided when a list is chosen and on every restart; a run keeps its mode to the end.
  const [preferredWriting, setPreferredWriting] = useWritingMode()
  const [writingChoice, setWritingChoice] = useState(() => writingChoiceFor(list, preferredWriting))
  const [pickerOpen, setPickerOpen] = useState(false)
  const { labels, category, setCategory, asideQuery, setAsideQuery, asidePacks, pickerQuery: query, setPickerQuery: setQuery, pickerPacks: filteredPacks } = useListChoosers(packs, wordLists)
  const [menuOpen, setMenuOpen] = useState(false)
  // All the words of the list start shown, so a list can be previewed right after choosing it.
  const [showAll, setShowAll] = useState(true)
  const [inputFocused, setInputFocused] = useState(false)
  const [focusedOnce, setFocusedOnce] = useState(false)
  const started = session.startedAt !== null
  // WritingPractice reports its run, so switching lists asks first and the device stays locked as when typing.
  const [writingRun, setWritingRun] = useState<WritingRun | null>(null)
  const typingRunning = started && !finished
  const mode: PracticeMode = currentMode(writingChoice, started, practiceMode, chosenMode)
  const recall = mode === 'recall'
  const running = mode === 'writing' ? writingRun !== null : typingRunning
  const runDevice = mode === 'writing' ? writingRun?.device : practiceDevice
  const words = list?.words ?? []
  const selectedList = wordLists.find(item => item.id === list?.id)
  const selectedRecords = selectedList?.records ?? []
  // Bests and comparisons only use runs of the mode being practised.
  const modeRecords = recordsOfMode(selectedRecords, mode)
  const bestCandidates = selectedList ? comparableRecords(selectedList, selectedRecords, mode) : []
  // Colour only committed text: IME composition (romaji, pinyin) is shown below the word but never judged.
  const comparison = compareInput(word?.input ?? '', session.input, session.missed)
  // With simple input on, the keys that stand for the word's accented and Cyrillic letters are shown under it.
  // Recall mode leaves them out, as they would give away the answer.
  const simpleKeys = typingOptions.ignoreAccents && word && !recall ? simpleInputKeys(word.input) : []
  const { pending, cancels, requestList, requestWriting, confirm, cancel } = usePracticeSwitch({ wordLists, selected, running, currentChoice: writingChoice, onSwitchList: switchTo, onChooseWriting: chooseWriting })
  const dialogOpen = pickerOpen || pending !== null || menuOpen
  const showResume = mode !== 'writing' && focusedOnce && !inputFocused && !finished && !dialogOpen && words.length > 0

  const { focusInput, focusPractice, rememberOpener, closePicker, focusTypingNext } = usePracticeFocus({ mode, finished, input, showResume, writingChoice })
  function openPicker() {
    rememberOpener()
    setPickerOpen(true)
  }
  function restart(index = selected, preferred = preferredWriting) {
    // Also reset manually scrolled display-only text, including an identical word on a fresh attempt.
    setDisplayRun(value => value + 1)
    setWritingChoice(writingChoiceFor(wordLists[index], preferred))
    restartPractice(index)
  }
  // Practises again only the words missed in the run just finished, the same way (typing or writing). Not recorded.
  function reviewMissed(missed: SavedWordList['words']) {
    setDisplayRun(value => value + 1)
    restartPractice(selected, missed)
  }
  function chooseWriting(next: WritingChoice) {
    setPreferredWriting(next)
    if (next === 'normal') focusTypingNext()
    restart(selected, next)
  }
  // Switching recall starts the list again; it cannot be switched during a run.
  function switchRecall() {
    if (running) return
    chooseRecall(recall ? 'normal' : 'recall')
    restart()
  }
  function switchTo(index: number) {
    setShowAll(true)
    restart(index)
  }
  function requestSwitch(id: string) {
    setPickerOpen(false)
    setQuery('')
    requestList(id)
  }
  // What the confirmation names as the switch's target: the other list, or the other way of practising.
  const switchTarget = pending?.kind === 'mode' ? t(pending.mode === 'writing' ? 'modeWriting' : 'modeTyping')
    : pending?.kind === 'list' && wordLists[pending.index] ? practiceName(wordLists[pending.index]) : ''

  return <main className="mx-auto my-6 w-11/12 max-w-7xl pb-12 sm:my-8">
    {error && <ErrorAlert className="mb-4">{error}</ErrorAlert>}
    {!list?.words.length ? <Card className="px-5 py-8 text-base sm:px-8"><p>{t.rich('empty', {
      catalog: chunks => <Link href="/packs/catalog" className="underline">{chunks}</Link>,
      create: chunks => <Link href="/packs/create" className="underline">{chunks}</Link>,
    })}</p></Card> :
    <div className={cn("grid items-start gap-6", asideOpen && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
      {/* The best records sit under the practice card, so they stay in view when the word lists are closed. */}
      <div className="grid min-w-0 gap-6">
      {/* A finger straying off the handwriting pad would otherwise start selecting the text around it. */}
      <Card className="min-w-0 gap-0 py-0 text-base has-[#writingPad]:select-none">
        <PracticeHeader list={list} listName={practiceName(list)} wordCount={words.length} devices={devices} device={running ? runDevice : device} running={running} mode={mode} finished={finished}
          statsVisible={statsVisible} asideOpen={asideOpen} onOpenPicker={openPicker} onChooseDevice={chooseDevice} onDeviceMenuOpenChange={setMenuOpen} onDeviceMenuCloseAutoFocus={focusPractice}
          onSwitchRecall={switchRecall} onStatsVisibleChange={setStatsVisible} onAsideOpenChange={setAsideOpen} onFocusInput={focusInput} onRestart={() => restart()} />
        {/* Only a list marked for writing offers the choice; a run already going keeps its mode though the mark is removed. */}
        {selectedList?.writing && <div className="flex justify-center border-b px-4 py-2">
          <ModeToggle options={WRITING_CHOICES} value={writingChoice} onChange={requestWriting} label={t('modeLabel')} labels={{ normal: t('modeTyping'), writing: t('modeWriting') }} />
        </div>}
        {review && <p role="status" className="border-b bg-muted/50 px-4 py-2 text-center text-[13px] text-muted-foreground sm:px-6">{t('result.reviewing', { count: words.length })}</p>}
        {mode === 'writing' ? <WritingPractice key={`${list.id}:${displayRun}`} list={list} listName={practiceName(list)} records={selectedRecords} addRecord={addRecord} device={device}
          review={review} statsVisible={statsVisible} onRun={setWritingRun} onRestart={() => restart()} onReview={reviewMissed} onChooseList={openPicker} />
        : <>
        <PracticeProgress index={session.index} total={words.length} finished={finished} />
        {finished ? <PracticeResult listName={practiceName(list)} words={words} mistakes={session.wordMistakes} review={review} result={result} correct={session.attempts - session.mistakes} speed={typingSpeed(session, 0)}
          device={practiceDevice} record={record} records={selectedRecords} mode={mode} saveState={saveState} onRestart={() => restart()} onReview={reviewMissed} onRetry={retrySave} onChooseList={openPicker} />
        : <>
          <WordPrompt key={`${list.id}:${session.index}:${displayRun}`} word={word} recall={recall} comparison={comparison} revealed={session.revealed} showResume={showResume}
            onReveal={reveal} onResume={() => input.current?.focus()} />
          <TypingInput inputRef={input} session={session} composition={composition} comparison={comparison} simpleKeys={simpleKeys}
            onFocus={() => { setInputFocused(true); setFocusedOnce(true); resume() }} onBlur={() => { setInputFocused(false); pause() }} onRestart={() => restart()}
            onCompositionStart={startComposition} onCompositionEnd={endComposition} onChange={changeInput} />
          {statsVisible && <LiveStats mode={mode} session={session} accuracy={result.accuracy} />}
          {/* The coming words would give away the answers in recall mode. */}
          {!recall && <UpcomingWords words={words} index={session.index} showAll={showAll} onToggleAll={() => { setShowAll(value => !value); focusInput() }} />}
        </>}
        </>}
      </Card>
      <BestRecordsCard list={list} mode={mode} records={bestCandidates} showsCountNote={bestCandidates.length < modeRecords.length} wordCount={selectedList?.words.length ?? 0}
        highlightId={saveState === 'saved' ? record?.id : undefined} />
      </div>
      <ListChooserAside open={asideOpen} packs={asidePacks} labels={labels} category={category} onCategoryChange={setCategory} query={asideQuery} onQueryChange={setAsideQuery}
        selectedId={list.id} resetKey={cancels} mode={mode} onSelect={id => { setAsideQuery(''); requestSwitch(id) }} />
    </div>}
    <ListPickerDialog open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (!open) setQuery('') }} onCloseAutoFocus={closePicker}
      packs={filteredPacks} labels={labels} category={category} onCategoryChange={setCategory} query={query} onQueryChange={setQuery}
      selectedId={list?.id} resetKey={cancels} mode={mode} onSelect={requestSwitch} />
    <SwitchConfirmDialog open={pending !== null} onCancel={cancel} onConfirm={confirm} onCloseAutoFocus={focusPractice}
      description={t('switch.description', { list: list ? practiceName(list) : '', done: mode === 'writing' ? writingRun?.index ?? 0 : session.index, total: words.length, next: switchTarget })} />
  </main>
}
