"use client"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ChevronsUpDown, CircleAlert, Keyboard, ListPlus, Pencil, Plus } from "lucide-react"
import { SearchField } from "@/components/ui/search-field"
import { Alert, AlertDescription, ErrorAlert } from "@/components/ui/alert"
import { ReloadButton } from "@/components/ui/reload-button"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import CategorySelect from "@/components/Practice/CategorySelect"
import WordListOptions from "@/components/Practice/WordListOptions"
import ListLabels from "@/components/WordLists/ListLabels"
import PageStorageBadge from "@/components/PageStorageBadge"
import { useWordLists } from "@/lib/useWordLists"
import { matchesPackQuery, packOverviews, type PackOverview } from "@/core/packEditing"
import { packsByRecentPractice } from "@/core/packPractice"
import type { WordPack } from "@/core/wordPacks"
import { listLabels, matchesFilter } from "@/core/listOverview"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import type { SavedWordList } from "@/core/wordLists"
import { PageHeader, PageMain } from "@/components/ui/page-layout"

export default function Words() {
  const t = useTranslations('wordLists.words')
  const page = useTranslations('wordLists.page')
  const workspace = useWordLists()
  return <PageMain width="wide">
    <PageHeader title={t('title')} description={t('description')}>
      {workspace.ready && <PageStorageBadge storage={workspace.storage} />}
    </PageHeader>
    {workspace.error && <ErrorAlert className="mb-6" action={<ReloadButton>{page('reload')}</ReloadButton>}>{workspace.error}</ErrorAlert>}
    {!workspace.ready ? <LoadingState />
      : workspace.lists.length ? <Suspense fallback={<LoadingState />}><WordsView key={workspace.accountId} lists={workspace.lists} packs={workspace.packs} /></Suspense>
        // After a failed load the lists are unknown; "no lists yet" would be wrong.
        : !workspace.error && <NoWords />}
  </PageMain>
}

// `?list=<id>` keeps the chosen list in the URL, so it can be reloaded or opened from elsewhere. Without it the first
// list is shown, as on the practice screen.
// The packs of `category` (null for every category) that `query` finds, in the order given.
function matchingPacks(items: PackOverview[], category: string | null, query: string) {
  return items.filter(item => matchesFilter(item.pack, { category, tags: [] }) && matchesPackQuery(item, query))
}

function WordsView({ lists, packs }: { lists: SavedWordList[]; packs: WordPack[] }) {
  const t = useTranslations('wordLists.words')
  const practiceName = usePracticeName()
  const page = useTranslations('wordLists.page')
  const locale = useLocale()
  const params = useSearchParams()
  const requestedId = params.get('list')
  const requested = lists.find(list => list.id === requestedId)
  const list = requested ?? lists[0]
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pickerQuery, setPickerQuery] = useState('')
  // One category for both list choosers, as on the practice screen.
  const [category, setCategory] = useState<string | null>(null)
  const asideLists = useRef<HTMLDivElement>(null)

  // Keeps the chosen list in view inside the scrolling list of lists, without scrolling the page.
  useEffect(() => {
    const box = asideLists.current
    const chosen = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!box || !chosen) return
    const top = chosen.offsetTop - box.offsetTop
    if (top < box.scrollTop || top + chosen.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - 8
  }, [list.id])

  function choose(id: string) {
    setPickerOpen(false)
    setPickerQuery('')
    window.history.replaceState(null, '', `${window.location.pathname}?list=${encodeURIComponent(id)}`)
  }

  // Recently practised packs come first, narrowed down by category and by what the pack, its lists and its words say.
  const overviews = useMemo(() => packsByRecentPractice(packOverviews({ packs, lists })), [packs, lists])
  const labels = useMemo(() => listLabels(packs, locale), [packs, locale])
  const asideFiltered = useMemo(() => matchingPacks(overviews, category, query), [overviews, category, query])
  const pickerFiltered = useMemo(() => matchingPacks(overviews, category, pickerQuery), [overviews, category, pickerQuery])

  return <div className="space-y-4">
    {requestedId && !requested && <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{page('notFound')}</AlertDescription>
    </Alert>}
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      {/* Below lg the lists are chosen in a dialog, so the words come first on a phone. The lists fit between their
          sticky top (5rem) and the page's bottom padding (4rem): taller, the end of a long word list would push them up
          under the top bar. */}
      <aside aria-label={t('lists')} className="hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-9rem)] lg:flex-col">
        <Card className="min-h-0 gap-1 p-3">
          <h2 className="pl-2 text-[15px] font-bold">{t('lists')}</h2>
          <WordSearch value={query} onChange={setQuery} className="mx-1 mt-1 mb-1 h-9 shrink-0" />
          <div className="mx-1 mb-1"><CategorySelect labels={labels} value={category} onChange={setCategory} /></div>
          <div ref={asideLists} className="max-h-[36rem] min-h-0 overflow-y-auto overscroll-contain">
            {asideFiltered.length ? <WordListOptions label={t('lists')} packs={asideFiltered} selectedId={list.id} query={query} onSelect={id => { setQuery(''); choose(id) }} />
              : <p className="px-2 py-2 text-sm text-muted-foreground">{t('noMatch')}</p>}
          </div>
        </Card>
      </aside>
      <Card className="min-w-0 gap-0 py-0 text-base">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b px-4 py-4 sm:px-6">
          <div className="grid min-w-0 flex-1 basis-60 gap-1">
            <h2 id="words-title" className="text-lg font-bold [overflow-wrap:anywhere]"><PracticeName list={list} /></h2>
            <ListLabels list={list} />
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {t('wordCount', { count: list.words.length })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (!open) setPickerQuery('') }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="lg" className="lg:hidden" aria-label={t('switchList', { name: practiceName(list) })}>
                  <ChevronsUpDown aria-hidden="true" />{t('switch')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('pickerTitle')}</DialogTitle>
                  <DialogDescription>{t('pickerDescription')}</DialogDescription>
                </DialogHeader>
                <WordSearch value={pickerQuery} onChange={setPickerQuery} className="h-10" />
                <CategorySelect labels={labels} value={category} onChange={setCategory} size="large" />
                <div className="-mx-1 max-h-[min(28rem,calc(100dvh-18rem))] overflow-y-auto overscroll-contain px-1">
                  {pickerFiltered.length ? <WordListOptions label={t('candidates')} packs={pickerFiltered} selectedId={list.id} query={pickerQuery} onSelect={choose} />
                    : <p className="px-1 py-2 text-sm text-muted-foreground">{t('noMatch')}</p>}
                </div>
              </DialogContent>
            </Dialog>
            <Button size="lg" asChild><Link href={`/play?list=${encodeURIComponent(list.id)}`} aria-label={t('practiceList', { name: practiceName(list) })}><Keyboard aria-hidden="true" />{t('practice')}</Link></Button>
            <Button variant="outline" size="lg" asChild><Link href={`/edit?list=${encodeURIComponent(list.id)}`} aria-label={t('editList', { name: practiceName(list) })}><Pencil aria-hidden="true" />{t('edit')}</Link></Button>
          </div>
        </div>
        <WordTable list={list} />
      </Card>
    </div>
  </div>
}

function WordSearch({ value, onChange, className }: { value: string; onChange: (value: string) => void; className: string }) {
  const t = useTranslations('wordLists.words')
  return <SearchField value={value} onChange={onChange} placeholder={t('filter')} ariaLabel={t('filter')} className={className} />
}

// Two columns at every width: the number, and the text to type with the shown word and the note under it. The shown
// word is left out when it is the same as the text to type. Long words, such as an SQL statement, wrap inside their
// cell instead of widening the table.
function WordTable({ list }: { list: SavedWordList }) {
  const t = useTranslations('wordLists.words')
  const editor = useTranslations('wordLists.editor')
  const text = 'whitespace-pre-wrap [overflow-wrap:anywhere]'
  return <Table aria-labelledby="words-title" className="table-fixed">
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-12 pl-4 text-right sm:w-14 sm:pl-6"><span aria-hidden="true">#</span><span className="sr-only">{t('number')}</span></TableHead>
        <TableHead className="pr-4 sm:pr-6">{editor('input')}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {list.words.map((word, index) => <TableRow key={index} className="align-top">
        <TableCell className="py-2.5 pl-4 text-right align-top text-muted-foreground tabular-nums sm:pl-6">{index + 1}</TableCell>
        <TableCell className={`py-2.5 pr-4 align-top sm:pr-6 ${text}`}>
          <span className="font-mono font-medium">{word.input}</span>
          {word.display !== word.input && <p className="mt-1 text-sm">{word.display}</p>}
          {word.annotation && <p className="mt-1 text-[13px] text-muted-foreground">{word.annotation}</p>}
        </TableCell>
      </TableRow>)}
    </TableBody>
  </Table>
}

function NoWords() {
  const t = useTranslations('wordLists')
  return <EmptyState className="py-10 sm:py-14">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><ListPlus className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 className="font-bold">{t('empty.title')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.description')}</p>
    </div>
    <Button asChild><Link href="/packs/create"><Plus aria-hidden="true" />{t('manager.create')}</Link></Button>
  </EmptyState>
}

function LoadingState() {
  const common = useTranslations('common')
  return <div role="status" className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <span className="sr-only">{common('loading')}</span>
    <div className="hidden space-y-3 rounded-xl border bg-card p-3 lg:block">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-1.5 px-1 py-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3.5 w-1/2" /></div>)}
    </div>
    <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
    </div>
  </div>
}
