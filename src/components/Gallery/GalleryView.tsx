import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ErrorAlert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import GalleryFilters from '@/components/Gallery/GalleryFilters'
import GalleryList from '@/components/Gallery/GalleryList'
import GalleryLoading from '@/components/Gallery/GalleryLoading'
import { galleryQueryOf, gallerySearchParams, type GalleryQuery } from '@/core/gallery'
import { useErrorText } from '@/i18n/useErrorText'
import { useGalleryResults } from '@/lib/useGalleryResults'

export default function GalleryView() {
  const t = useTranslations('wordLists.gallery')
  const errorText = useErrorText()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = galleryQueryOf(searchParams)
  const { categories, results, failure, loadingMore, loadMore, retry } = useGalleryResults(query)

  function go(next: GalleryQuery) {
    const params = gallerySearchParams(next).toString()
    router.replace(params ? `${pathname}?${params}` : pathname)
  }

  const message = failure ? errorText(failure, t('loadFailed')) : ''
  return <div className="space-y-6">
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('intro')}</p>
    </header>

    <GalleryFilters query={query} categories={categories} onChange={go} />

    {message ? <ErrorAlert action={<Button variant="outline" size="sm" onClick={() => results ? void loadMore() : retry()}>{t('retry')}</Button>}>{message}</ErrorAlert> : null}
    {results ? <GalleryList packs={results.packs} more={results.more} loadingMore={loadingMore} filtered={Boolean(query.text.trim() || query.category)} onMore={() => void loadMore()} />
      : failure ? null : <GalleryLoading />}
  </div>
}
