"use client"
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Copy, Download, History, Keyboard, MoreHorizontal, Pencil, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/i18n/useFormat'
import { wordPreview, type ListOverview } from '@/core/listOverview'
import { cn } from '@/lib/utils'
import ListLabels from './ListLabels'

const svgClass = '[&_svg]:shrink-0 [&_svg]:text-muted-foreground'

/** How often a list has been practised and when last, such as 練習 3回 · 最終 今日. */
export function usePracticeText() {
  const t = useTranslations('wordLists.row')
  const format = useFormat()
  return ({ practiceCount, lastPracticed }: ListOverview, now: Date) => lastPracticed === null ? t('notPracticed')
    : t('practiced', { count: practiceCount, day: format.day(new Date(lastPracticed), now) })
}

// One saved list: what it contains and how it has been used, with 編集 up front and everything else in the menu.
export default function ListRow({ item, now, highlight, disabled, canCopy, readOnly, onEdit, onExport, onCopy, onDelete }: {
  item: ListOverview
  now: Date
  highlight: boolean
  disabled: boolean
  canCopy: boolean
  /** A list of a followed pack: it is practised and exported, not edited, copied or deleted. */
  readOnly?: boolean
  onEdit: () => void
  onExport: () => void
  onCopy: () => void
  onDelete: () => void
}) {
  const t = useTranslations('wordLists.row')
  const practiceText = usePracticeText()
  const { list, practiceCount } = item
  const id = encodeURIComponent(list.id)
  const preview = wordPreview(list)
  const words = preview.words.join(t('separator'))
  return <li data-list-id={list.id}
    className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 transition-colors duration-700 motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:gap-x-5 sm:px-5',
      highlight && 'bg-green-50 duration-0 dark:bg-green-950/40')}>
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <h3 className="font-medium [overflow-wrap:anywhere]">{list.name}</h3>
        <ListLabels list={list} />
      </div>
      <p className="truncate text-sm text-muted-foreground" title={list.words.map(word => word.display).join(t('separator'))}>
        <span className="sr-only">{t('examples')} </span>{preview.rest ? t('more', { words, rest: preview.rest }) : words}
      </p>
      <p className="pt-0.5 text-xs text-muted-foreground tabular-nums sm:hidden">{t('wordCount', { count: list.words.length })} · {practiceText(item, now)}</p>
    </div>
    <div className="hidden space-y-0.5 text-[13px] tabular-nums sm:block">
      <p className="font-medium">{t('wordCount', { count: list.words.length })}</p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="size-3.5 shrink-0" aria-hidden="true" />{practiceText(item, now)}</p>
    </div>
    <div className="-mr-2 flex items-center gap-1 sm:mr-0">
      <Button asChild variant="ghost" size="lg" className="hidden h-10 px-3 text-muted-foreground sm:inline-flex" title={t('practice')}>
        <Link href={`/play?list=${id}`} aria-label={t('practiceList', { name: list.name })}><Keyboard aria-hidden="true" />{t('practice')}</Link>
      </Button>
      {!readOnly && <Button data-edit variant="outline" size="lg" className="size-10 px-0 sm:w-auto sm:px-3" disabled={disabled} onClick={onEdit} aria-label={t('editList', { name: list.name })} title={t('edit')}>
        <Pencil aria-hidden="true" /><span className="hidden sm:inline">{t('edit')}</span>
      </Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" aria-label={t('moreFor', { name: list.name })} title={t('moreActions')}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
          <DropdownMenuItem asChild className={cn(svgClass, 'sm:hidden')}>
            <Link href={`/play?list=${id}`}><Keyboard aria-hidden="true" />{t('practiceThis')}</Link>
          </DropdownMenuItem>
          {practiceCount > 0 && <>
            <DropdownMenuItem asChild className={svgClass}>
              <Link href={`/rankings?list=${id}`}><Trophy aria-hidden="true" />{t('rankings')}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={svgClass}>
              <Link href={`/records?list=${id}`}><History aria-hidden="true" />{t('records')}<span className="ml-auto text-xs text-muted-foreground tabular-nums">{t('recordCount', { count: practiceCount })}</span></Link>
            </DropdownMenuItem>
          </>}
          <DropdownMenuSeparator className={!practiceCount ? 'sm:hidden' : undefined} />
          <DropdownMenuItem className={svgClass} onSelect={onExport}><Download aria-hidden="true" />{t('export')}</DropdownMenuItem>
          {!readOnly && <>
            <DropdownMenuItem className={svgClass} disabled={disabled || !canCopy} onSelect={onCopy}><Copy aria-hidden="true" />{t('copy')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="[&_svg]:shrink-0 [&_svg]:text-destructive" disabled={disabled} onSelect={onDelete}>
              <Trash2 aria-hidden="true" />{t('delete')}
            </DropdownMenuItem>
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </li>
}
