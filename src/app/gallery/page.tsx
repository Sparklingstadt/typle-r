"use client"
import { Suspense, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { CircleAlert, Search } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import GalleryList from "@/components/Gallery/GalleryList"
import { AppError } from "@/core/appError"
import {
  GALLERY_SORTS, decodeGalleryCategories, decodeGalleryPage, galleryApiPath, galleryQueryOf, gallerySearchParams,
  type GalleryCategory, type GalleryPack, type GalleryQuery, type GallerySort,
} from "@/core/gallery"
import { useErrorText } from "@/i18n/useErrorText"

// The gallery is public: this page sits outside the (workspace) group, so it opens without a login or the workspace gate.
// useSearchParams makes the page client-rendered up to the Suspense boundary, so the boundary wraps just the part that reads it.
export default function GalleryPage() {
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    <Suspense fallback={<Loading />}><Gallery /></Suspense>
  </main>
}

function Loading() {
  const common = useTranslations('common')
  return <div role="status" className="space-y-3">
    <span className="sr-only">{common('loading')}</span>
    <Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-full" />
    <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(key => <Skeleton key={key} className="h-28 w-full" />)}</div>
  </div>
}

// What a search found, tagged with the search it answers so an answer that arrives late is never shown for another one.
type Results = { token: string; packs: GalleryPack[]; more: boolean; page: number }
const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

async function fetchPage(query: GalleryQuery, page: number) {
  const response = await fetch(galleryApiPath(query, page), { cache: 'no-store' })
  if (response.status === 400) throw new AppError('invalidQuery')
  if (!response.ok) throw new Error(`Unexpected status ${response.status}`)
  return decodeGalleryPage(await response.json())
}

// The typed text is applied on submit only; the box starts again (by its key) when the address brings other text.
function SearchBox({ text, onSearch }: { text: string; onSearch: (text: string) => void }) {
  const t = useTranslations('wordLists.gallery')
  const [draft, setDraft] = useState(text)
  return <form role="search" className="flex min-w-60 flex-1 gap-2" onSubmit={event => { event.preventDefault(); onSearch(draft.trim()) }}>
    <Input type="search" aria-label={t('search')} value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} />
    <Button type="submit"><Search aria-hidden="true" />{t('search')}</Button>
  </form>
}

function Gallery() {
  const t = useTranslations('wordLists.gallery')
  const errorText = useErrorText()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = galleryQueryOf(searchParams)
  const key = gallerySearchParams(query).toString()
  const [categories, setCategories] = useState<GalleryCategory[]>([])
  const [loaded, setLoaded] = useState<Results | null>(null)
  const [failed, setFailed] = useState<{ token: string; reason: unknown } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const token = `${key}#${attempt}`
  const results = loaded?.token === token ? loaded : null
  const failure = failed?.token === token ? failed.reason : null

  useEffect(() => {
    let active = true
    fetch('/api/gallery/categories', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`Unexpected status ${response.status}`)
      if (active) setCategories(decodeGalleryCategories(await response.json()))
    }).catch(() => { /* The filter just offers fewer choices. */ })
    return () => { active = false }
  }, [])

  // A new condition starts again from the first page.
  useEffect(() => {
    let active = true
    fetchPage(galleryQueryOf(new URLSearchParams(key)), 1).then(
      page => {
        if (!active) return
        // A failure left by an earlier visit to this search (a failed "more") must not show above the fresh results.
        setFailed(null)
        setLoaded({ ...page, token: `${key}#${attempt}`, page: 1 })
      },
      reason => { if (active) setFailed({ token: `${key}#${attempt}`, reason }) },
    )
    return () => { active = false }
  }, [key, attempt])

  function go(next: GalleryQuery) {
    const params = gallerySearchParams(next).toString()
    router.replace(params ? `${pathname}?${params}` : pathname)
  }

  async function loadMore() {
    if (!results) return
    setLoadingMore(true)
    setFailed(null)
    try {
      const page = await fetchPage(query, results.page + 1)
      setLoaded(current => current && current.token === results.token && current.page === results.page
        ? { token: current.token, packs: [...current.packs, ...page.packs], more: page.more, page: results.page + 1 } : current)
    } catch (reason) { setFailed({ token: results.token, reason }) } finally { setLoadingMore(false) }
  }

  const choices = query.category && !categories.some(category => category.name === query.category)
    ? [...categories, { name: query.category, count: 0 }] : categories
  const message = failure ? errorText(failure, t('loadFailed')) : ''
  return <div className="space-y-6">
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('intro')}</p>
    </header>

    <div className="flex flex-wrap items-end gap-3">
      <SearchBox key={query.text} text={query.text} onSearch={text => go({ ...query, text })} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('category')}
        <select className={selectClass} value={query.category} onChange={event => go({ ...query, category: event.target.value })}>
          <option value="">{t('allCategories')}</option>
          {choices.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('sort')}
        <select className={selectClass} value={query.sort} onChange={event => go({ ...query, sort: event.target.value as GallerySort })}>
          {GALLERY_SORTS.map(sort => <option key={sort} value={sort}>{sort === 'new' ? t('sortNew') : t('sortPopular')}</option>)}
        </select>
      </label>
    </div>

    {message ? <Alert variant="destructive"><CircleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-3">
        {message}
        <Button variant="outline" size="sm" onClick={() => results ? void loadMore() : setAttempt(n => n + 1)}>{t('retry')}</Button>
      </AlertDescription>
    </Alert> : null}
    {results ? <GalleryList packs={results.packs} more={results.more} loadingMore={loadingMore} filtered={Boolean(query.text || query.category)} onMore={() => void loadMore()} />
      : failure ? null : <Loading />}
  </div>
}
