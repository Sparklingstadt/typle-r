"use client"
import { Suspense, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ErrorAlert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import GalleryList from "@/components/Gallery/GalleryList"
import {
  GALLERY_SORTS, fetchGalleryCategories, fetchGalleryPage, galleryQueryOf, gallerySearchParams,
  type GalleryCategory, type GalleryPack, type GalleryQuery, type GallerySort,
} from "@/core/gallery"
import { useErrorText } from "@/i18n/useErrorText"
import { PageMain } from "@/components/ui/page-layout"
import GalleryLoading from "@/components/Gallery/GalleryLoading"
import GallerySearchBox from "@/components/Gallery/GallerySearchBox"

// The gallery is public: this page sits outside the (workspace) group, so it opens without a login or the workspace gate.
// useSearchParams makes the page client-rendered up to the Suspense boundary, so the boundary wraps just the part that reads it.
export default function GalleryPage() {
  return <PageMain width="medium">
    <Suspense fallback={<GalleryLoading />}><Gallery /></Suspense>
  </PageMain>
}

// What a search found, tagged with the search it answers so an answer that arrives late is never shown for another one.
type Results = { token: string; packs: GalleryPack[]; more: boolean; page: number }

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
    fetchGalleryCategories().then(categories => {
      if (active) setCategories(categories)
    }).catch(() => { /* The filter just offers fewer choices. */ })
    return () => { active = false }
  }, [])

  // A new condition starts again from the first page.
  useEffect(() => {
    let active = true
    fetchGalleryPage(galleryQueryOf(new URLSearchParams(key)), 1).then(
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
      const page = await fetchGalleryPage(query, results.page + 1)
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
      <GallerySearchBox key={query.text} text={query.text} onSearch={text => go({ ...query, text })} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('category')}
        <NativeSelect variant="compact" value={query.category} onChange={event => go({ ...query, category: event.target.value })}>
          <option value="">{t('allCategories')}</option>
          {choices.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('sort')}
        <NativeSelect variant="compact" value={query.sort} onChange={event => go({ ...query, sort: event.target.value as GallerySort })}>
          {GALLERY_SORTS.map(sort => <option key={sort} value={sort}>{sort === 'new' ? t('sortNew') : t('sortPopular')}</option>)}
        </NativeSelect>
      </label>
    </div>

    {message ? <ErrorAlert action={<Button variant="outline" size="sm" onClick={() => results ? void loadMore() : setAttempt(n => n + 1)}>{t('retry')}</Button>}>{message}</ErrorAlert> : null}
    {results ? <GalleryList packs={results.packs} more={results.more} loadingMore={loadingMore} filtered={Boolean(query.text.trim() || query.category)} onMore={() => void loadMore()} />
      : failure ? null : <GalleryLoading />}
  </div>
}
