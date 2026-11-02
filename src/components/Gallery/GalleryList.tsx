import Link from "next/link"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { GalleryPack } from "@/core/gallery"

type Props = {
  packs: GalleryPack[]
  more: boolean
  loadingMore: boolean
  filtered: boolean
  onMore: () => void
}

// The cards of one search, and the button that adds the next page after them.
export default function GalleryList({ packs, more, loadingMore, filtered, onMore }: Props) {
  const t = useTranslations('wordLists.gallery')
  const labels = useTranslations('wordLists.labels')
  if (!packs.length) return <p role="status" className="rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground">
    {filtered ? t('noResults') : t('empty')}
  </p>
  return <div className="space-y-4">
    <ul className="grid gap-3 sm:grid-cols-2">
      {packs.map(pack => <li key={pack.id} className="rounded-xl border bg-card transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/40">
        <Link href={`/shared/${encodeURIComponent(pack.id)}`} className="flex h-full flex-col gap-2 rounded-xl px-5 py-4 outline-none">
          <span className="font-bold break-words">{pack.name}</span>
          {pack.description ? <span className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{pack.description}</span> : null}
          {pack.category || pack.tags?.length ? <span className="flex flex-wrap items-center gap-1.5">
            {pack.category ? <Badge variant="secondary"><span className="sr-only">{labels('category')}: </span>{pack.category}</Badge> : null}
            {pack.tags?.map(tag => <Badge key={tag} variant="outline"><span className="sr-only">{labels('tag')}: </span>{tag}</Badge>)}
          </span> : null}
          <span className="mt-auto flex flex-wrap gap-x-3 pt-1 text-xs text-muted-foreground">
            <span>{t('lists', { count: pack.lists })}</span>
            <span>{t('words', { count: pack.words })}</span>
            <span>{t('added', { count: pack.added })}</span>
          </span>
        </Link>
      </li>)}
    </ul>
    {more ? <div className="flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={onMore}>{t('more')}</Button></div> : null}
  </div>
}
