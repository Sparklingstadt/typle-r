"use client"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, ChevronDown, ChevronsUpDown, ChevronUp, CircleAlert, Eye, EyeOff, Gauge, List, MousePointerClick, PanelRightClose, PanelRightOpen, Plus, RotateCcw, Search, Target, Timer, X } from "lucide-react"
import type { PracticeDevice } from "@/core/devices"
import { useChosenDevice } from "@/lib/deviceSelection"
import { useLiveStatsVisible } from "@/lib/liveStats"
import { usePlayAsideOpen } from "@/lib/playAside"
import { useTypingOptions } from "@/lib/inputSettings"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useWordLists, type RecordSave } from "@/lib/useWordLists"
import type { SavedWordList } from "@/core/wordLists"
import { usePractice } from "@/lib/usePractice"
import { compareInput, elapsedTime, simpleInputKeys, typingSpeed, type TypingSession } from "@/core/typing"
import { comparableRecords } from "@/core/records"
import { listLabels, matchesFilter } from "@/core/listOverview"
import { matchesPackQuery, packOverviews, type PackOverview } from "@/core/packEditing"
import { packsByRecentPractice } from "@/core/packPractice"
import type { WordPack } from "@/core/wordPacks"
import { cn } from "@/lib/utils"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import TargetText from "@/components/Practice/TargetText"
import PracticeText from "@/components/Practice/PracticeText"
import Kbd from "@/components/Practice/Kbd"
import DeviceMenu from "@/components/Practice/DeviceMenu"
import WordListOptions from "@/components/Practice/WordListOptions"
import CategorySelect from "@/components/Practice/CategorySelect"
import PracticeBestRecords from "@/components/Practice/PracticeBestRecords"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import PracticeResult from "@/components/Practice/PracticeResult"

// The packs of `category` (null for every category) that `query` finds, in the order given.
function matchingPacks(items: PackOverview[], category: string | null, query: string) {
  return items.filter(item => matchesFilter(item.pack, { category, tags: [] }) && matchesPackQuery(item, query))
}

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

// Ticks only while a session is running, for the live elapsed time and speed.
function useNow(active: boolean) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function formatClock(milliseconds: number) {
  const seconds = Math.max(0, milliseconds) / 1000
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

// Owns the ticking clock, so only these four values re-render every 200ms instead of the whole page.
function LiveStats({ session, accuracy }: { session: TypingSession; accuracy: number }) {
  const running = session.startedAt !== null && session.finishedAt === null
  // While paused the values stand still, so the clock stops ticking too.
  const now = useNow(running && session.pausedAt == null)
  const elapsed = running ? elapsedTime(session, now) : 0
  const speed = running ? typingSpeed(session, now) : null
  const t = useTranslations('practice.stats')
  const stats = [
    { icon: Timer, term: t('elapsed'), value: formatClock(elapsed) },
    { icon: Gauge, term: t('speed'), value: speed === null ? '—' : String(speed), unit: t('speedUnit') },
    { icon: Target, term: t('accuracy'), value: session.attempts ? `${Math.round(accuracy * 10) / 10}%` : '—' },
    { icon: X, term: t('mistakes'), value: String(session.mistakes) },
  ]
  return <dl aria-label={t('label')} className="mx-4 mb-4 grid grid-cols-4 rounded-xl border bg-muted/40 px-1 py-2.5 text-center sm:mx-6 sm:mb-5 sm:px-2 sm:py-3">
    {stats.map(stat => <div key={stat.term} className="grid gap-0.5">
      <dt className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground sm:text-xs"><stat.icon className="size-3" aria-hidden="true" />{stat.term}</dt>
      <dd className="text-base font-medium tabular-nums sm:text-xl">{stat.value}{stat.unit && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground sm:text-xs">{stat.unit}</span>}</dd>
    </div>)}
  </dl>
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
  const { list, selected, session, practiceDevice, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart: restartPractice, retrySave, pause, resume } = usePractice(wordLists, addRecord, device, listId)
  const [displayRun, setDisplayRun] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [asideQuery, setAsideQuery] = useState('')
  // One category for both list choosers: the lists of a subject stay in view while switching between them.
  const [category, setCategory] = useState<string | null>(null)
  const locale = useLocale()
  const asideLists = useRef<HTMLDivElement>(null)
  const [pendingSwitch, setPendingSwitch] = useState<number | null>(null)
  // Counts the switches given up on, so the choosers let go of the levels chosen for them.
  const [switchCancels, setSwitchCancels] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  // All the words of the list start shown, so a list can be previewed right after choosing it.
  const [showAll, setShowAll] = useState(true)
  const [inputFocused, setInputFocused] = useState(false)
  const [focusedOnce, setFocusedOnce] = useState(false)
  const allWords = useRef<HTMLUListElement>(null)
  const pickerOpener = useRef<HTMLElement | null>(null)
  const started = session.startedAt !== null
  const running = started && !finished
  const words = list?.words ?? []
  const selectedList = wordLists.find(item => item.id === list?.id)
  const selectedRecords = selectedList?.records ?? []
  const bestCandidates = selectedList ? comparableRecords(selectedList) : []
  // Colour only committed text: IME composition (romaji, pinyin) is shown below the word but never judged.
  const comparison = compareInput(word?.input ?? '', session.input, session.missed)
  const hasError = comparison.errorIndex >= 0
  // With simple input on, the keys that stand for the word's accented and Cyrillic letters are shown under it.
  const simpleKeys = typingOptions.ignoreAccents && word ? simpleInputKeys(word.input) : []
  const dialogOpen = pickerOpen || pendingSwitch !== null || menuOpen
  const showResume = focusedOnce && !inputFocused && !finished && !dialogOpen && words.length > 0

  useEffect(() => {
    const box = allWords.current
    const current = box?.querySelector<HTMLElement>('[aria-current="step"]')
    if (box && current) box.scrollTop = current.offsetTop - 48
  }, [showAll, session.index])

  // Keeps the chosen list in view inside the scrolling list of lists, without scrolling the page.
  useEffect(() => {
    const box = asideLists.current
    const chosen = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!box || !chosen) return
    const top = chosen.offsetTop - box.offsetTop
    if (top < box.scrollTop || top + chosen.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - 8
  }, [list?.id])

  // While the input has lost focus, any printable key or Enter outside another control brings it back.
  useEffect(() => {
    if (!showResume) return
    function resume(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
      if (event.key.length !== 1 && event.key !== 'Enter') return
      event.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', resume)
    return () => document.removeEventListener('keydown', resume)
  }, [showResume, input])

  // After a dialog or menu closes, typing continues in the input; on the result screen focus returns to the trigger.
  function focusPractice(event: Event) {
    if (finished) return
    event.preventDefault()
    input.current?.focus()
  }
  // The picker is opened from buttons that are not its Radix trigger, so remember where focus should return.
  function openPicker() {
    pickerOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPickerOpen(true)
  }
  function closePicker(event: Event) {
    event.preventDefault()
    if (finished) pickerOpener.current?.focus()
    else input.current?.focus()
  }
  function restart(index = selected) {
    // Also reset manually scrolled display-only text, including an identical word on a fresh attempt.
    setDisplayRun(value => value + 1)
    restartPractice(index)
  }
  function switchTo(index: number) {
    setShowAll(true)
    restart(index)
  }
  function requestSwitch(id: string) {
    const index = wordLists.findIndex(item => item.id === id)
    setPickerOpen(false)
    setQuery('')
    if (index < 0) return
    if (!running) switchTo(index)
    else if (index !== selected) setPendingSwitch(index)
  }
  // Recently practised packs come first, and both choosers can be narrowed down by category and by what the pack, its lists
  // and its words say.
  const overviews = useMemo(() => packsByRecentPractice(packOverviews({ packs, lists: wordLists })), [packs, wordLists])
  const labels = useMemo(() => listLabels(packs, locale), [packs, locale])
  const filteredPacks = useMemo(() => matchingPacks(overviews, category, query), [overviews, category, query])
  const asidePacks = useMemo(() => matchingPacks(overviews, category, asideQuery), [overviews, category, asideQuery])
  const next = words.slice(session.index + 1, session.index + 4)
  const remaining = words.length - session.index - 1 - next.length
  const progressText = t('progress.value', { current: finished ? words.length : session.index + 1, total: words.length })
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
          <DeviceMenu devices={devices} device={running ? practiceDevice : device} locked={running} onChange={chooseDevice} onOpenChange={setMenuOpen} onCloseAutoFocus={focusPractice} />
          {/* Hiding the live stats only changes the display: timing, saving and the result screen stay the same. */}
          <Button variant="ghost" size="icon-lg" className="shrink-0" aria-pressed={statsVisible} aria-label={t('header.liveStats')} title={t('header.liveStats')}
            onClick={() => { setStatsVisible(!statsVisible); if (!finished) input.current?.focus() }}>
            {statsVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </Button>
          {/* Only wide screens put the panel beside the card; below that it follows the card and stays shown. */}
          <Button variant="ghost" size="icon-lg" className="hidden shrink-0 lg:inline-flex" aria-pressed={asideOpen} aria-controls="practice-aside" aria-label={t('header.aside')} title={t('header.aside')}
            onClick={() => { setAsideOpen(!asideOpen); if (!finished) input.current?.focus() }}>
            {asideOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
          </Button>
          <Button variant="ghost" size="lg" className="shrink-0 px-2 sm:px-2.5" onClick={() => restart()} aria-label={t('header.restart')} aria-keyshortcuts="Escape" title={t('header.restartTitle')}>
            <RotateCcw aria-hidden="true" /><span className="hidden sm:inline">{t('header.restartShort')}</span><Kbd className="hidden sm:inline-flex">Esc</Kbd>
          </Button>
        </div>
        <div className="flex items-center gap-3 px-4 pt-3 text-sm font-medium tabular-nums sm:px-6 sm:pt-4">
          <div role="progressbar" aria-label={t('progress.label')} aria-valuemin={0} aria-valuemax={words.length} aria-valuenow={finished ? words.length : session.index} aria-valuetext={progressText} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${(finished ? 1 : session.index / words.length) * 100}%` }} />
          </div>
          <span aria-hidden="true">{progressText}</span>
        </div>
        {finished ? <PracticeResult listName={practiceName(list)} wordCount={words.length} result={result} correct={session.attempts - session.mistakes} speed={typingSpeed(session, 0)}
          device={practiceDevice} record={record} records={selectedRecords} saveState={saveState} onRestart={() => restart()} onRetry={retrySave} onChooseList={openPicker} />
        : <>
          <div key={`${list.id}:${session.index}:${displayRun}`} className="relative flex min-h-44 flex-1 flex-col items-center justify-center gap-3 px-4 pt-6 pb-2 text-center sm:min-h-52 sm:gap-3.5 sm:px-6 sm:pt-11">
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
          {statsVisible && <LiveStats session={session} accuracy={result.accuracy} />}
          <div className="flex min-h-14 flex-wrap items-center gap-2 border-t px-4 py-2.5 sm:pr-3 sm:pl-6">
            <span className="text-xs text-muted-foreground">{t('upcoming.next')}</span>
            {next.map((item, index) => <span key={index} className="inline-flex h-7 max-w-full items-center rounded-full border px-3 text-[13px] text-muted-foreground" title={item.display}><span className="truncate whitespace-pre">{item.input_type === 'code' ? item.display.replace(/\r\n|\r|\n/g, '  ') : item.display}</span></span>)}
            {!next.length && <span className="text-xs text-muted-foreground">{t('upcoming.last')}</span>}
            {remaining > 0 && <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('upcoming.more', { count: remaining })}</span>}
            <span className="flex-1" />
            <Button variant="ghost" size="lg" aria-expanded={showAll} aria-controls="all-words" onClick={() => { setShowAll(value => !value); input.current?.focus() }}>
              {t('upcoming.showAll')}{showAll ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </Button>
            {showAll && <ul id="all-words" ref={allWords} aria-label={t('upcoming.allWords')} className="relative mt-1.5 flex max-h-44 basis-full flex-wrap gap-1.5 overflow-y-auto border-t border-dashed pt-2.5 pb-1">
              {words.map((item, index) => {
                const done = index < session.index
                const display = item.input_type === 'code' ? item.display.replace(/\r\n|\r|\n/g, '  ') : item.display
                const paragraph = item.input_type !== 'code' && (Array.from(item.display).length > 24 || item.display.includes('\n'))
                return <li key={index} className={cn('max-w-full', paragraph && 'w-full')}>
                  <span aria-current={index === session.index ? 'step' : undefined}
                    className={cn('min-h-7 max-w-full border px-3 text-[13px] text-muted-foreground',
                      paragraph ? 'block rounded-lg py-2 text-left leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]' : 'inline-flex items-center rounded-full break-all whitespace-pre-wrap',
                      done && 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
                      index === session.index && 'border-transparent bg-primary text-primary-foreground')}>
                    {display}<span className="sr-only">{t(done ? 'upcoming.done' : index === session.index ? 'upcoming.current' : 'upcoming.pending')}</span>
                  </span>
                </li>
              })}
            </ul>}
          </div>
        </>}
      </Card>
      <aside id="practice-aside" aria-label={t('aside.label')} className={cn("grid min-w-0 gap-6", !asideOpen && "lg:hidden")}>
        <Card className="gap-1 p-3">
          <div className="flex items-center gap-2 pl-2">
            <h2 className="text-[15px] font-bold">{t('aside.lists')}</h2>
            <span className="flex-1" />
            <Button variant="ghost" size="lg" asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('aside.create')}</Link></Button>
          </div>
          <label className="mx-1 mt-1 mb-1 flex h-9 items-center gap-2 rounded-lg border px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input type="search" value={asideQuery} onChange={event => setAsideQuery(event.target.value)} placeholder={t('picker.filter')} aria-label={t('aside.filter')} autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
          <div className="mx-1 mb-1"><CategorySelect labels={labels} value={category} onChange={setCategory} /></div>
          {/* Its own scroll area, so a long collection never pushes the page far below the practice card. */}
          <div ref={asideLists} className="max-h-96 overflow-y-auto overscroll-contain lg:max-h-[min(36rem,calc(100dvh-14rem))]">
            {asidePacks.length ? <WordListOptions label={t('aside.lists')} packs={asidePacks} selectedId={list.id} query={asideQuery} resetKey={switchCancels}
              onSelect={id => { setAsideQuery(''); requestSwitch(id) }} />
              : <p className="px-2 py-2 text-sm text-muted-foreground">{t('picker.noMatch')}</p>}
          </div>
        </Card>
        <Card className="gap-2 px-4 pt-4 pb-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="shrink-0 text-[15px] font-bold">{t('aside.best')}</h2>
            <span className="truncate text-xs text-muted-foreground"><PracticeName list={list} /></span>
          </div>
          <p className="text-xs text-muted-foreground">{bestCandidates.length < selectedRecords.length ? t('aside.bestOrderAtCount', { count: selectedList?.words.length ?? 0 }) : t('aside.bestOrder')}</p>
          <PracticeBestRecords records={bestCandidates} highlightId={saveState === 'saved' ? record?.id : undefined} />
          <Link href={`/rankings?list=${encodeURIComponent(list.id)}`} className="inline-flex w-fit items-center gap-1 rounded-sm px-2 pt-1 text-[13px] font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{t('aside.allBest')}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
        </Card>
      </aside>
    </div>}
    <Dialog open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (!open) setQuery('') }}>
      <DialogContent className="max-w-md" onCloseAutoFocus={closePicker}>
        <DialogHeader>
          <DialogTitle>{t('picker.title')}</DialogTitle>
          <DialogDescription>{t('picker.description')}</DialogDescription>
        </DialogHeader>
        <label className="flex h-10 items-center gap-2 rounded-lg border px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('picker.filter')} aria-label={t('picker.filter')} autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        <CategorySelect labels={labels} value={category} onChange={setCategory} className="h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30" />
        {filteredPacks.length ? <WordListOptions label={t('picker.candidates')} packs={filteredPacks} selectedId={list?.id} query={query} resetKey={switchCancels} onSelect={requestSwitch} />
          : <p className="px-1 py-2 text-sm text-muted-foreground">{t('picker.noMatch')}</p>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={pendingSwitch !== null} onOpenChange={open => { if (!open) { setPendingSwitch(null); setSwitchCancels(count => count + 1) } }}>
      <AlertDialogContent onCloseAutoFocus={focusPractice}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('switch.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('switch.description', { list: list ? practiceName(list) : '', done: session.index, total: words.length, next: pendingSwitch === null || !wordLists[pendingSwitch] ? '' : practiceName(wordLists[pendingSwitch]) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('switch.continue')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (pendingSwitch !== null) switchTo(pendingSwitch) }}>{t('switch.confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
}
