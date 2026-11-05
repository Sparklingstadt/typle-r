import { useEffect, useState } from 'react'
import { fetchGalleryCategories, fetchGalleryPage, galleryQueryOf, gallerySearchParams, type GalleryCategory, type GalleryPack, type GalleryQuery } from '@/core/gallery'

// What a search found, tagged with the search it answers so an answer that arrives late is never shown for another one.
type Results = { token: string; packs: GalleryPack[]; more: boolean; page: number }

// The packs that `query` finds, a page at a time, and the categories to filter by.
export function useGalleryResults(query: GalleryQuery) {
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

  return { categories, results, failure, loadingMore, loadMore, retry: () => setAttempt(n => n + 1) }
}
