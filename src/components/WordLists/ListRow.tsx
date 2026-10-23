"use client"
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { DropdownMenu } from 'radix-ui'
import { Copy, Download, History, Keyboard, MoreHorizontal, Pencil, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/i18n/useFormat'
import { wordPreview, type ListOverview } from '@/core/listOverview'
import { cn } from '@/lib/utils'
import ListLabels from './ListLabels'

const menuItem = 'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

/** How often a list has been practised and when last, such as 練習 3回 · 最終 今日. */
export function usePracticeText() {
  const t = useTranslations('wordLists.row')
  const format = useFormat()
  return ({ practiceCount, lastPracticed }: ListOverview, now: Date) => lastPracticed === null ? t('notPracticed')
    : t('practiced', { count: practiceCount, day: format.day(new Date(lastPracticed), now) })
}

// One saved list: what it contains and how it has been used, with 編集 up front and everything else in the menu.
export default function ListRow({ item, now, highlight, disabled, canCopy, onEdit, onExport, onCopy, onDelete }: {
  item: ListOverview
  now: Date
  highlight: boolean
  disabled: boolean
  canCopy: boolean
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
      <Button data-edit variant="outline" size="lg" className="size-10 px-0 sm:w-auto sm:px-3" disabled={disabled} onClick={onEdit} aria-label={t('editList', { name: list.name })} title={t('edit')}>
        <Pencil aria-hidden="true" /><span className="hidden sm:inline">{t('edit')}</span>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" aria-label={t('moreFor', { name: list.name })} title={t('moreActions')}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            <DropdownMenu.Item asChild className={cn(menuItem, 'sm:hidden')}>
              <Link href={`/play?list=${id}`}><Keyboard aria-hidden="true" />{t('practiceThis')}</Link>
            </DropdownMenu.Item>
            {practiceCount > 0 && <>
              <DropdownMenu.Item asChild className={menuItem}>
                <Link href={`/rankings?list=${id}`}><Trophy aria-hidden="true" />{t('rankings')}</Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild className={menuItem}>
                <Link href={`/records?list=${id}`}><History aria-hidden="true" />{t('records')}<span className="ml-auto text-xs text-muted-foreground tabular-nums">{t('recordCount', { count: practiceCount })}</span></Link>
              </DropdownMenu.Item>
            </>}
            <DropdownMenu.Separator className={cn('my-1 h-px bg-border', !practiceCount && 'sm:hidden')} />
            <DropdownMenu.Item className={menuItem} onSelect={onExport}><Download aria-hidden="true" />{t('export')}</DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} disabled={disabled || !canCopy} onSelect={onCopy}><Copy aria-hidden="true" />{t('copy')}</DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={cn(menuItem, 'text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive')} disabled={disabled} onSelect={onDelete}>
              <Trash2 aria-hidden="true" />{t('delete')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  </li>
}
