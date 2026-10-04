"use client"
import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowRight, ChevronDown, ChevronsUpDown, ChevronUp, CircleAlert, Gauge, List, MousePointerClick, Plus, RotateCcw, Search, Target, Timer, X } from "lucide-react"
import type { PracticeDevice } from "@/core/devices"
import { useSelectedDevice } from "@/lib/deviceSelection"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useWordLists, type WorkspaceUpdate } from "@/lib/useWordLists"
import type { SavedWordList } from "@/core/wordLists"
import { usePractice } from "@/lib/usePractice"
import { compareInput, typingSpeed, type TypingSession } from "@/core/typing"
import { comparableRecords } from "@/core/records"
import { cn } from "@/lib/utils"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import TargetText from "@/components/Practice/TargetText"
import Kbd from "@/components/Practice/Kbd"
import DeviceMenu from "@/components/Practice/DeviceMenu"
import WordListOptions from "@/components/Practice/WordListOptions"
import PracticeBestRecords from "@/components/Practice/PracticeBestRecords"
import PracticeResult from "@/components/Practice/PracticeResult"

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
  const { lists, devices, accountId, ready, error, update } = useWordLists()
  if (!ready) return <Loading />
  return <Practice key={accountId} accountId={accountId ?? ""} devices={devices} wordLists={lists} listId={listId} error={error} update={update} />
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
  const now = useNow(running)
  const elapsed = running && now > (session.startedAt ?? 0) ? now - (session.startedAt ?? 0) : 0
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

// Shorter text gets the large size; anything over 24 characters wraps as a left-aligned paragraph.
function wordSize(text: string) {
  const length = Array.from(text).length
  if (length > 24) return 'text-xl leading-relaxed text-left sm:text-[26px] max-w-[34em]'
  return length > 10 ? 'text-[32px] leading-tight sm:text-[44px]' : 'text-[44px] leading-tight sm:text-[64px]'
}

function Practice({ wordLists, listId, error, update, devices, accountId }: {
  devices: PracticeDevice[]
  accountId: string
  wordLists: SavedWordList[]
  listId: string | null
  error: string
  update: WorkspaceUpdate
}) {
  const t = useTranslations('practice')
  const [deviceId, chooseDevice] = useSelectedDevice(accountId)
  const device = devices.find(item => item.id === deviceId)
  const { list, selected, session, practiceDevice, composition, startComposition, endComposition, changeInput, record, saveState, input, word, finished, result, restart, retrySave } = usePractice(wordLists, update, device, listId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingSwitch, setPendingSwitch] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
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
  // Colour only committed text: IME composition (romaji, pinyin) is shown in the input but never judged.
  const comparison = compareInput(word?.input ?? '', session.input)
  const hasError = comparison.errorIndex >= 0
  const dialogOpen = pickerOpen || pendingSwitch !== null || menuOpen
  const showResume = focusedOnce && !inputFocused && !finished && !dialogOpen && words.length > 0

  useEffect(() => {
    const box = allWords.current
    const current = box?.querySelector<HTMLElement>('[aria-current="step"]')
    if (box && current) box.scrollTop = current.offsetTop - 48
  }, [showAll, session.index])

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
  function switchTo(index: number) {
    setShowAll(false)
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
  const filteredLists = wordLists.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()))
  const next = words.slice(session.index + 1, session.index + 4)
  const remaining = words.length - session.index - 1 - next.length
  const progressText = t('progress.value', { current: finished ? words.length : session.index + 1, total: words.length })
  const feedback = hasError
    ? <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{t('feedback.mismatch', { position: comparison.errorIndex + 1 })}</span>
    : composition !== null ? <span>{t('feedback.composing')}</span>
    : <span className="hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:flex"><span className="inline-flex items-center gap-1.5"><Kbd>Backspace</Kbd>{t('feedback.backspace')}</span><span className="inline-flex items-center gap-1.5"><Kbd>Esc</Kbd>{t('feedback.restart')}</span></span>

  return <main className="mx-auto my-6 w-11/12 max-w-7xl pb-12 sm:my-8">
    {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {!list?.words.length ? <Card className="px-5 py-8 text-base sm:px-8"><p>{t.rich('empty', { link: chunks => <Link href="/create" className="underline">{chunks}</Link> })}</p></Card> :
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0 gap-0 self-stretch py-0 text-base">
        <div className="flex h-14 items-center gap-1.5 border-b px-2 sm:h-16 sm:gap-3 sm:px-3">
          <button type="button" onClick={openPicker} aria-haspopup="dialog" aria-label={t('header.switchList', { name: list.name })}
            className="flex h-10 min-w-0 items-center gap-2 rounded-lg px-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-2.5">
            <List className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
            <span className="truncate text-[15px] font-bold text-foreground sm:text-base">{list.name}</span>
            <span className="hidden shrink-0 text-[13px] sm:inline">{t('header.wordCount', { count: words.length })}</span>
            <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
          <span className="flex-1" />
          <DeviceMenu devices={devices} device={running ? practiceDevice : device} locked={running} onChange={chooseDevice} onOpenChange={setMenuOpen} onCloseAutoFocus={focusPractice} />
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
        {finished ? <PracticeResult listName={list.name} wordCount={words.length} result={result} correct={session.attempts - session.mistakes} speed={typingSpeed(session, 0)}
          device={practiceDevice} record={record} records={selectedRecords} saveState={saveState} onRestart={() => restart()} onRetry={retrySave} onChooseList={openPicker} />
        : <>
          <div className="relative flex min-h-44 flex-1 flex-col items-center justify-center gap-3 px-4 pt-6 pb-2 text-center sm:min-h-52 sm:gap-3.5 sm:px-6 sm:pt-11">
            {word?.annotation && <p className="max-w-full text-base break-words text-foreground">{word.annotation}</p>}
            {word && word.display === word.input
              ? <TargetText id="wordDisplay" {...comparison} className={wordSize(word.display)} />
              : word && <>
                <p id="wordDisplay" className={cn('m-0 max-w-full font-medium whitespace-pre-wrap [overflow-wrap:anywhere]', wordSize(word.display))}>{word.display}</p>
                <div className="flex max-w-full flex-wrap items-center justify-center gap-2.5">
                  <span className="rounded-full border px-2 text-xs text-muted-foreground">{t('word.typeThis')}</span>
                  <TargetText {...comparison} className="text-2xl tracking-wide sm:text-3xl" />
                </div>
              </>}
            {showResume && <button type="button" onClick={() => input.current?.focus()} className="absolute inset-0 z-10 grid place-items-center bg-card/70 outline-none backdrop-blur-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><MousePointerClick className="size-4" aria-hidden="true" />{t('word.resume')}</span>
            </button>}
          </div>
          <div className="flex flex-col items-center gap-2.5 px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
            <Input ref={input} id="wordInputField" placeholder={t('word.placeholder')} value={composition ?? session.input} autoComplete="off" autoCapitalize="off" spellCheck={false}
              aria-label={t('word.inputLabel')} aria-invalid={hasError} aria-describedby="practice-feedback"
              className={cn('h-13 w-full max-w-[440px] rounded-[10px] border-2 text-center text-[22px] md:text-2xl focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/35 aria-invalid:ring-4 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 sm:h-14', composition !== null && 'underline decoration-dotted underline-offset-6')}
              onPaste={event => event.preventDefault()} onDrop={event => event.preventDefault()}
              onFocus={() => { setInputFocused(true); setFocusedOnce(true) }} onBlur={() => setInputFocused(false)}
              onKeyDown={event => { if (event.key === 'Escape' && composition === null && !event.nativeEvent.isComposing) { event.preventDefault(); restart() } }}
              onCompositionStart={startComposition}
              onCompositionEnd={event => endComposition(event.currentTarget.value)}
              onChange={event => changeInput(event.target.value, (event.nativeEvent as InputEvent).isComposing)} />
            <p id="practice-feedback" aria-live="polite" className="flex min-h-5 flex-wrap items-center justify-center text-xs text-muted-foreground">{feedback}</p>
          </div>
          <LiveStats session={session} accuracy={result.accuracy} />
          <div className="flex min-h-14 flex-wrap items-center gap-2 border-t px-4 py-2.5 sm:pr-3 sm:pl-6">
            <span className="text-xs text-muted-foreground">{t('upcoming.next')}</span>
            {next.map((item, index) => <span key={index} className="inline-flex h-7 max-w-full items-center truncate rounded-full border px-3 text-[13px] text-muted-foreground">{item.display}</span>)}
            {!next.length && <span className="text-xs text-muted-foreground">{t('upcoming.last')}</span>}
            {remaining > 0 && <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('upcoming.more', { count: remaining })}</span>}
            <span className="flex-1" />
            <Button variant="ghost" size="lg" aria-expanded={showAll} aria-controls="all-words" onClick={() => { setShowAll(value => !value); input.current?.focus() }}>
              {t('upcoming.showAll')}{showAll ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </Button>
            {showAll && <ul id="all-words" ref={allWords} aria-label={t('upcoming.allWords')} className="relative mt-1.5 flex max-h-44 basis-full flex-wrap gap-1.5 overflow-y-auto border-t border-dashed pt-2.5 pb-1">
              {words.map((item, index) => {
                const done = index < session.index
                return <li key={index} className="max-w-full">
                  <span aria-current={index === session.index ? 'step' : undefined}
                    className={cn('inline-flex min-h-7 max-w-full items-center rounded-full border px-3 text-[13px] break-all text-muted-foreground',
                      done && 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
                      index === session.index && 'border-transparent bg-primary text-primary-foreground')}>
                    {item.display}<span className="sr-only">{t(done ? 'upcoming.done' : index === session.index ? 'upcoming.current' : 'upcoming.pending')}</span>
                  </span>
                </li>
              })}
            </ul>}
          </div>
        </>}
      </Card>
      <aside aria-label={t('aside.label')} className="grid min-w-0 gap-6">
        <Card className="gap-1 p-3">
          <div className="flex items-center gap-2 pl-2">
            <h2 className="text-[15px] font-bold">{t('aside.lists')}</h2>
            <span className="flex-1" />
            <Button variant="ghost" size="lg" asChild><Link href="/create"><Plus aria-hidden="true" />{t('aside.create')}</Link></Button>
          </div>
          <WordListOptions label={t('aside.lists')} lists={wordLists} selectedId={list.id} onSelect={requestSwitch} />
        </Card>
        <Card className="gap-2 px-4 pt-4 pb-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="shrink-0 text-[15px] font-bold">{t('aside.best')}</h2>
            <span className="truncate text-xs text-muted-foreground">{list.name}</span>
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
        {filteredLists.length ? <WordListOptions label={t('picker.candidates')} lists={filteredLists} selectedId={list?.id} onSelect={requestSwitch} />
          : <p className="px-1 py-2 text-sm text-muted-foreground">{t('picker.noMatch')}</p>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={pendingSwitch !== null} onOpenChange={open => { if (!open) setPendingSwitch(null) }}>
      <AlertDialogContent onCloseAutoFocus={focusPractice}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('switch.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('switch.description', { list: list?.name ?? '', done: session.index, total: words.length, next: pendingSwitch === null ? '' : wordLists[pendingSwitch]?.name ?? '' })}
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
