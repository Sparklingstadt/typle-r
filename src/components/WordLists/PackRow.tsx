"use client"
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronRight, Copy, Download, EyeOff, History, Keyboard, Library, ListPlus, MoreHorizontal, Pencil, Share2, Trash2, UserMinus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PackOverview } from '@/core/packEditing'
import { cn } from '@/lib/utils'
import ListLabels from './ListLabels'
import { usePracticeText } from './ListRow'

const svgClass = '[&_svg]:shrink-0 [&_svg]:text-muted-foreground'

// The lists of a pack as one row, such as Linuxコマンド with its 11 lists, which opens to show each of them with its
// own actions. A pack of one list is a row too. 練習 opens the list of the pack practised last, or its first.
// `onAddList` and `onCopy` are left out when no more lists can be saved.
export default function PackRow({ item, now, open, onToggle, highlight, disabled, onEditPack, onAddList, onCopy, onExport, onShare, shared, listed, hidden, onDeletePack, followed, onUnfollow, children }: {
  item: PackOverview
  now: Date
  open: boolean
  onToggle: () => void
  highlight: boolean
  disabled: boolean
  onEditPack: () => void
  onAddList?: () => void
  onCopy?: () => void
  onExport: () => void
  /** Left out for a guest, who has no account to share from. */
  onShare?: () => void
  /** The pack has a share link. */
  shared?: boolean
  /** The share is in the gallery. */
  listed?: boolean
  /** An administrator took the share out of the gallery, so its owner cannot put it back. */
  hidden?: boolean
  onDeletePack: () => void
  /** A followed official pack: it has no editing actions, and 'フォロー解除' takes the place of 削除. */
  followed?: boolean
  onUnfollow?: () => void
  children: ReactNode
}) {
  const t = useTranslations('wordLists.pack')
  const follow = useTranslations('wordLists.follow')
  const practiceText = usePracticeText()
  const { pack, lists } = item
  const latest = lists.reduce<PackOverview['lists'][number] | null>((last, entry) =>
    entry.lastPracticed === null || (last && (last.lastPracticed ?? 0) >= entry.lastPracticed) ? last : entry, null)
  const practiceId = (latest ?? lists[0])?.list.id
  const usage = practiceText({ list: lists[0].list, position: 0, practiceCount: item.practiceCount, lastPracticed: item.lastPracticed }, now)
  const id = `pack-${encodeURIComponent(pack.id)}`
  return <li data-pack-id={pack.id}>
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 transition-colors duration-700 motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:gap-x-5 sm:px-5',
      highlight && 'bg-green-50 duration-0 dark:bg-green-950/40')}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {/* The heading holds the button that opens the pack, as the disclosure pattern has it. */}
          <h3 className="font-medium [overflow-wrap:anywhere]">
            <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
              className="-my-1 -ml-1.5 inline-flex items-start gap-1.5 rounded-md py-1 pr-1 pl-1.5 text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              <ChevronRight className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden="true" />
              {pack.name}
            </button>
          </h3>
          <ListLabels list={pack} />
          {followed && <Badge variant="secondary">{follow('badge')}</Badge>}
          {shared && <Badge variant="secondary" className="gap-1"><Share2 className="size-3" aria-hidden="true" />{t('shared')}</Badge>}
          {listed && !hidden && <Badge variant="secondary" className="gap-1"><Library className="size-3" aria-hidden="true" />{t('listed')}</Badge>}
          {hidden && <Badge variant="destructive" className="gap-1"><EyeOff className="size-3" aria-hidden="true" />{t('hidden')}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('lists', { count: lists.length })}
          {/* A pack of one list is practised or not, so the count says nothing there. */}
          {lists.length > 1 && <> · {t('practiced', { practiced: item.practicedListCount, lists: lists.length })}</>}
        </p>
        <p className="pt-0.5 text-xs text-muted-foreground tabular-nums sm:hidden">{t('wordCount', { count: item.wordCount })} · {usage}</p>
      </div>
      <div className="hidden space-y-0.5 text-[13px] tabular-nums sm:block">
        <p className="font-medium">{t('wordCount', { count: item.wordCount })}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="size-3.5 shrink-0" aria-hidden="true" />{usage}</p>
      </div>
      <div className="-mr-2 flex items-center gap-1 sm:mr-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" aria-label={t('moreFor', { name: pack.name })} title={t('moreActions')}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
            {practiceId && <DropdownMenuItem asChild className={svgClass}>
              <Link href={`/play?list=${encodeURIComponent(practiceId)}`}><Keyboard aria-hidden="true" />{t('practice')}</Link>
            </DropdownMenuItem>}
            {!followed && <DropdownMenuItem className={svgClass} disabled={disabled} onSelect={onEditPack}><Pencil aria-hidden="true" />{t('edit')}</DropdownMenuItem>}
            {!followed && onAddList && <DropdownMenuItem className={svgClass} disabled={disabled} onSelect={onAddList}><ListPlus aria-hidden="true" />{t('addList')}</DropdownMenuItem>}
            {onCopy && <DropdownMenuItem className={svgClass} disabled={disabled} onSelect={onCopy}><Copy aria-hidden="true" />{t('copy')}</DropdownMenuItem>}
            <DropdownMenuItem className={svgClass} onSelect={onExport}><Download aria-hidden="true" />{t('export')}</DropdownMenuItem>
            {onShare && <DropdownMenuItem className={svgClass} onSelect={onShare}><Share2 aria-hidden="true" />{t('share')}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="[&_svg]:shrink-0 [&_svg]:text-destructive" disabled={disabled} onSelect={followed ? onUnfollow : onDeletePack}>
              {followed ? <><UserMinus aria-hidden="true" />{follow('unfollow')}</> : <><Trash2 aria-hidden="true" />{t('delete')}</>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {open && <ul id={id} aria-label={t('listsOf', { name: pack.name })} className="ml-4 divide-y border-t border-l sm:ml-6">{children}</ul>}
  </li>
}
