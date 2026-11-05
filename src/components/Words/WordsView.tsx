import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronsUpDown, CircleAlert, Keyboard, Pencil } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SearchField } from '@/components/ui/search-field'
import CategorySelect from '@/components/Practice/CategorySelect'
import WordListOptions from '@/components/Practice/WordListOptions'
import PracticeName, { usePracticeName } from '@/components/PracticeName'
import ListLabels from '@/components/WordLists/ListLabels'
import WordTable from '@/components/Words/WordTable'
import { useListChoosers } from '@/lib/useListChoosers'
import type { SavedWordList } from '@/core/wordLists'
import type { WordPack } from '@/core/wordPacks'

// `?list=<id>` keeps the chosen list in the URL, so it can be reloaded or opened from elsewhere. Without it the first
// list is shown, as on the practice screen.
export default function WordsView({ lists, packs }: { lists: SavedWordList[]; packs: WordPack[] }) {
  const t = useTranslations('wordLists.words')
  const practiceName = usePracticeName()
  const page = useTranslations('wordLists.page')
  const params = useSearchParams()
  const requestedId = params.get('list')
  const requested = lists.find(list => list.id === requestedId)
  const list = requested ?? lists[0]
  const [pickerOpen, setPickerOpen] = useState(false)
  const { labels, category, setCategory, asideQuery: query, setAsideQuery: setQuery, asidePacks: asideFiltered, pickerQuery, setPickerQuery, pickerPacks: pickerFiltered } = useListChoosers(packs, lists)
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
