"use client"
import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Brain, ChevronsUpDown, CircleAlert, Eye, EyeOff, List, MousePointerClick, PanelRightClose, PanelRightOpen, RotateCcw } from "lucide-react"
import type { PracticeDevice } from "@/core/devices"
import { useChosenDevice } from "@/lib/deviceSelection"
import { useLiveStatsVisible } from "@/lib/liveStats"
import { usePracticeMode } from "@/lib/practiceMode"
import { usePlayAsideOpen } from "@/lib/playAside"
import { useTypingOptions } from "@/lib/inputSettings"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useWordLists, type RecordSave } from "@/lib/useWordLists"
import type { SavedWordList } from "@/core/wordLists"
import { usePractice } from "@/lib/usePractice"
import { usePracticeSwitch } from "@/lib/usePracticeSwitch"
import { usePracticeFocus } from "@/lib/usePracticeFocus"
import { compareInput, simpleInputKeys, typingSpeed } from "@/core/typing"
import { comparableRecords, recordsOfMode, type PracticeMode } from "@/core/records"
import { recallDisplayHint, recallPrompt } from "@/core/recallPrompt"
import { practiceMode as writingChoiceFor, useWritingMode, type WritingChoice } from "@/lib/writingMode"
import { listLabels } from "@/core/listOverview"
import { packOverviews } from "@/core/packEditing"
import { currentMode, matchingPacks } from "@/core/practiceView"
import { packsByRecentPractice } from "@/core/packPractice"
import type { WordPack } from "@/core/wordPacks"
import { cn } from "@/lib/utils"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import TargetText from "@/components/Practice/TargetText"
import PracticeText from "@/components/Practice/PracticeText"
import Kbd from "@/components/Practice/Kbd"
import DeviceMenu from "@/components/Practice/DeviceMenu"
import UpcomingWords from "@/components/Practice/UpcomingWords"
import BestRecordsCard from "@/components/Practice/BestRecordsCard"
import ListChooserAside from "@/components/Practice/ListChooserAside"
import ListPickerDialog from "@/components/Practice/ListPickerDialog"
import SwitchConfirmDialog from "@/components/Practice/SwitchConfirmDialog"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import PracticeResult from "@/components/Practice/PracticeResult"
import PracticeProgress from "@/components/Practice/PracticeProgress"
import LiveStats from "@/components/Practice/LiveStats"
import ModeToggle from "@/components/Practice/ModeToggle"
import WritingPractice, { type WritingRun } from "@/components/Practice/WritingPractice"

const WRITING_CHOICES = ['normal', 'writing'] as const

function Loading() {
  const common = useTranslations('common')
  return <Page><PageContainer><p>{common('loading')}</p></PageContainer></Page>
}

// `?list=<id>` preselects a list, e.g. from the home dashboard. Reading it needs a Suspense boundary for prerendering.
export default function Play() {
  return <Suspense fallback={<Loading />}><PlayWorkspace /></Suspense>
}

function PlayWorkspace() {
  const listId = useSearchParams().get('list')
  const { lists, packs, devices, accountId, ready, error, addRecord } = useWordLists()
  if (!ready) return <Loading />
  return <Practice key={accountId} accountId={accountId ?? ""} devices={devices} wordLists={lists} packs={packs} listId={listId} error={error} addRecord={addRecord} />
}

function Practice({ wordLists, packs, listId, error, addRecord, devices, accountId }: {
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
  const { list, selected, session, practiceDevice, practiceMode, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart: restartPractice, retrySave, pause, resume, reveal } = usePractice(wordLists, addRecord, device, listId, chosenMode)
  const [displayRun, setDisplayRun] = useState(0)
  // Typing or writing is decided when a list is chosen and on every restart; a run keeps its mode to the end.
  const [preferredWriting, setPreferredWriting] = useWritingMode()
  const [writingChoice, setWritingChoice] = useState(() => writingChoiceFor(list, preferredWriting))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [asideQuery, setAsideQuery] = useState('')
  // One category for both list choosers: the lists of a subject stay in view while switching between them.
  const [category, setCategory] = useState<string | null>(null)
  const locale = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  // All the words of the list start shown, so a list can be previewed right after choosing it.
  const [showAll, setShowAll] = useState(true)
  const [inputFocused, setInputFocused] = useState(false)
  const [focusedOnce, setFocusedOnce] = useState(false)
  const started = session.startedAt !== null
  // WritingPractice reports its run, so switching lists asks first and the device stays locked as when typing.
  const [writingRun, setWritingRun] = useState<WritingRun | null>(null)
  const typingRunning = started && !finished
  // Handwriting takes over the card; otherwise a started run keeps the mode it began in, like its device, and the
  // recall choice applies from the next run. Handwriting never combines with recall.
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
  const hasError = comparison.errorIndex >= 0
  // With simple input on, the keys that stand for the word's accented and Cyrillic letters are shown under it.
  // Recall mode leaves them out, as they would give away the answer.
  const simpleKeys = typingOptions.ignoreAccents && word && !recall ? simpleInputKeys(word.input) : []
  // Recall mode shows the annotation with the answer hidden and the display text when it differs from what is typed.
  const prompt = recall && word ? recallPrompt(word) : ''
  const displayHint = word && recall ? recallDisplayHint(word) : ''
  const { pending, cancels, requestList, requestWriting, confirm, cancel } = usePracticeSwitch({ wordLists, selected, running, currentChoice: writingChoice, onSwitchList: switchTo, onChooseWriting: chooseWriting })
  const dialogOpen = pickerOpen || pending !== null || menuOpen
  const showResume = mode !== 'writing' && focusedOnce && !inputFocused && !finished && !dialogOpen && words.length > 0

  const { focusInput, focusPractice, rememberOpener, closePicker, focusTypingNext } = usePracticeFocus({ mode, finished, input, showResume, writingChoice })
  // The picker is opened from buttons that are not its Radix trigger, so remember where focus should return.
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
  // Recently practised packs come first, and both choosers can be narrowed down by category and by what the pack, its lists
  // and its words say.
  const overviews = useMemo(() => packsByRecentPractice(packOverviews({ packs, lists: wordLists })), [packs, wordLists])
  const labels = useMemo(() => listLabels(packs, locale), [packs, locale])
  const filteredPacks = useMemo(() => matchingPacks(overviews, category, query), [overviews, category, query])
  const asidePacks = useMemo(() => matchingPacks(overviews, category, asideQuery), [overviews, category, asideQuery])
  // What the confirmation names as the switch's target: the other list, or the other way of practising.
  const switchTarget = pending?.kind === 'mode' ? t(pending.mode === 'writing' ? 'modeWriting' : 'modeTyping')
    : pending?.kind === 'list' && wordLists[pending.index] ? practiceName(wordLists[pending.index]) : ''
  const feedback = hasError
    ? <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{t('feedback.mismatch', { position: comparison.errorIndex + 1 })}</span>
    : composition !== null ? <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
      <span className="text-base text-foreground underline decoration-dotted underline-offset-4">{composition.startsWith(session.input) ? composition.slice(session.input.length) : composition}</span>{t('feedback.composing')}
    </span>
    : <span className="hidden items-center gap-1.5 sm:inline-flex"><Kbd>Esc</Kbd>{t('feedback.restart')}</span>

  return <main className="mx-auto my-6 w-11/12 max-w-7xl pb-12 sm:my-8">
    {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {!list?.words.length ? <Card className="px-5 py-8 text-base sm:px-8"><p>{t.rich('empty', {
      catalog: chunks => <Link href="/packs/catalog" className="underline">{chunks}</Link>,
      create: chunks => <Link href="/packs/create" className="underline">{chunks}</Link>,
    })}</p></Card> :
    <div className={cn("grid items-start gap-6", asideOpen && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
      {/* The best records sit under the practice card, so they stay in view when the word lists are closed. */}
      <div className="grid min-w-0 gap-6">
      <Card className="min-w-0 gap-0 py-0 text-base">
        <div className="flex h-14 items-center gap-1.5 border-b px-2 sm:h-16 sm:gap-3 sm:px-3">
          <button type="button" onClick={openPicker} aria-haspopup="dialog" aria-label={t('header.switchList', { name: practiceName(list) })}
            className="flex h-10 min-w-0 items-center gap-2 rounded-lg px-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-2.5">
            <List className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
            <span className="truncate text-[15px] font-bold text-foreground sm:text-base"><PracticeName list={list} /></span>
            <span className="hidden shrink-0 text-[13px] sm:inline">{t('header.wordCount', { count: words.length })}</span>
            <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
          <span className="flex-1" />
          <DeviceMenu devices={devices} device={running ? runDevice : device} locked={running} onChange={chooseDevice} onOpenChange={setMenuOpen} onCloseAutoFocus={focusPractice} />
          {/* Handwriting never combines with recall, so the recall switch is hidden while writing. */}
          {mode !== 'writing' && <Button variant="ghost" size="lg" className="shrink-0 px-2 sm:px-2.5" aria-pressed={recall} disabled={running} title={t('recall.toggle')} aria-label={t('recall.toggle')} onClick={switchRecall}>
            <Brain aria-hidden="true" /><span className="hidden xl:inline">{t('recall.toggle')}</span>
          </Button>}
          {/* Hiding the live stats only changes the display: timing, saving and the result screen stay the same. */}
          <Button variant="ghost" size="icon-lg" className="shrink-0" aria-pressed={statsVisible} aria-label={t('header.liveStats')} title={t('header.liveStats')}
            onClick={() => { setStatsVisible(!statsVisible); if (!finished) focusInput() }}>
            {statsVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </Button>
          {/* Only wide screens put the panel beside the card; below that it follows the card and stays shown. */}
          <Button variant="ghost" size="icon-lg" className="hidden shrink-0 lg:inline-flex" aria-pressed={asideOpen} aria-controls="practice-aside" aria-label={t('header.aside')} title={t('header.aside')}
            onClick={() => { setAsideOpen(!asideOpen); if (!finished) focusInput() }}>
            {asideOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
          </Button>
          <Button variant="ghost" size="lg" className="shrink-0 px-2 sm:px-2.5" onClick={() => restart()} aria-label={t('header.restart')} aria-keyshortcuts="Escape" title={t('header.restartTitle')}>
            <RotateCcw aria-hidden="true" /><span className="hidden sm:inline">{t('header.restartShort')}</span><Kbd className="hidden sm:inline-flex">Esc</Kbd>
          </Button>
        </div>
        {/* Only a list marked for writing offers the choice; a run already going keeps its mode though the mark is removed. */}
        {selectedList?.writing && <div className="flex justify-center border-b px-4 py-2">
          <ModeToggle options={WRITING_CHOICES} value={writingChoice} onChange={requestWriting} label={t('modeLabel')} labels={{ normal: t('modeTyping'), writing: t('modeWriting') }} />
        </div>}
        {mode === 'writing' ? <WritingPractice key={`${list.id}:${displayRun}`} list={list} listName={practiceName(list)} records={selectedRecords} addRecord={addRecord} device={device}
          statsVisible={statsVisible} onRun={setWritingRun} onRestart={() => restart()} onChooseList={openPicker} />
        : <>
        <PracticeProgress index={session.index} total={words.length} finished={finished} />
        {finished ? <PracticeResult listName={practiceName(list)} wordCount={words.length} result={result} correct={session.attempts - session.mistakes} speed={typingSpeed(session, 0)}
          device={practiceDevice} record={record} records={selectedRecords} mode={mode} saveState={saveState} onRestart={() => restart()} onRetry={retrySave} onChooseList={openPicker} />
        : <>
          <div key={`${list.id}:${session.index}:${displayRun}`} className="relative flex min-h-44 flex-1 flex-col items-center justify-center gap-3 px-4 pt-6 pb-2 text-center sm:min-h-52 sm:gap-3.5 sm:px-6 sm:pt-11">
            {recall ? word && <>
              {/* The original annotation is never shown here: it may contain the answer. */}
              {prompt && <p className="max-w-full text-base break-words text-foreground">{prompt}</p>}
              {displayHint && <PracticeText id="wordHint" text={displayHint} className="text-xl leading-[1.75] sm:text-[26px]" />}
              {!prompt && !displayHint && <p className="text-sm text-muted-foreground">{t('recall.noHint')}</p>}
              <TargetText id="wordDisplay" {...comparison} concealed={!session.revealed} />
              {/* Keeps the focus in the input, so the resume cover does not come up under the pointer and take the click. */}
              <Button variant="outline" size="sm" disabled={!!session.revealed} onMouseDown={event => event.preventDefault()} onClick={reveal}><Eye aria-hidden="true" />{t('recall.reveal')}</Button>
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
            {showResume && <button type="button" onClick={() => input.current?.focus()} className="absolute inset-0 z-10 grid place-items-center bg-card/70 outline-none backdrop-blur-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><MousePointerClick className="size-4" aria-hidden="true" />{t('word.resume')}</span>
            </button>}
          </div>
          <div className="relative flex flex-col items-center gap-2.5 px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
            {/* No visible field: the word itself shows the progress. This input only takes the keys, including IME composition
                and on-screen keyboards, and always holds the correct characters typed so far. */}
            <input ref={input} id="wordInputField" value={composition ?? session.input} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
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
              onFocus={() => { setInputFocused(true); setFocusedOnce(true); resume() }} onBlur={() => { setInputFocused(false); pause() }}
              onKeyDown={event => { if (event.key === 'Escape' && composition === null && !event.nativeEvent.isComposing) { event.preventDefault(); restart() } }}
              onCompositionStart={startComposition}
              onCompositionEnd={event => endComposition(event.currentTarget.value)}
              onChange={event => changeInput(event.target.value, (event.nativeEvent as InputEvent).isComposing)} />
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
          {statsVisible && <LiveStats mode={mode} session={session} accuracy={result.accuracy} />}
          {/* The coming words would give away the answers in recall mode. */}
          {!recall && <div className="flex min-h-14 flex-wrap items-center gap-2 border-t px-4 py-2.5 sm:pr-3 sm:pl-6">
            <UpcomingWords words={words} index={session.index} showAll={showAll} onToggleAll={() => { setShowAll(value => !value); focusInput() }} />
          </div>}
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
