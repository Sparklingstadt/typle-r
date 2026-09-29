"use client"
import Link from 'next/link'
import { DropdownMenu } from 'radix-ui'
import { Copy, Download, History, Keyboard, MoreHorizontal, Pencil, Trash2, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDay } from '@/lib/dashboard'
import { wordPreview, type ListOverview } from '@/lib/listOverview'
import { cn } from '@/lib/utils'

const menuItem = 'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

export function practiceText({ practiceCount, lastPracticed }: ListOverview, now: Date) {
  return lastPracticed === null ? 'まだ練習していません' : `練習 ${practiceCount}回 · 最終 ${formatDay(new Date(lastPracticed), now)}`
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
  const { list, practiceCount } = item
  const id = encodeURIComponent(list.id)
  return <li data-list-id={list.id}
    className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 transition-colors duration-700 motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:gap-x-5 sm:px-5',
      highlight && 'bg-green-50 duration-0 dark:bg-green-950/40')}>
    <div className="min-w-0 space-y-0.5">
      <h3 className="font-medium [overflow-wrap:anywhere]">{list.name}</h3>
      <p className="truncate text-sm text-muted-foreground" title={list.words.map(word => word.display).join('・')}>
        <span className="sr-only">単語の例 </span>{wordPreview(list)}
      </p>
      <p className="pt-0.5 text-xs text-muted-foreground tabular-nums sm:hidden">{list.words.length.toLocaleString()}語 · {practiceText(item, now)}</p>
    </div>
    <div className="hidden space-y-0.5 text-[13px] tabular-nums sm:block">
      <p className="font-medium">{list.words.length.toLocaleString()}語</p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="size-3.5 shrink-0" aria-hidden="true" />{practiceText(item, now)}</p>
    </div>
    <div className="-mr-2 flex items-center gap-1 sm:mr-0">
      <Button asChild variant="ghost" size="icon-lg" className="hidden size-10 text-muted-foreground sm:inline-flex" title="練習">
        <Link href={`/play?list=${id}`} aria-label={`${list.name} を練習`}><Keyboard aria-hidden="true" /></Link>
      </Button>
      <Button data-edit variant="outline" size="lg" className="size-10 px-0 sm:w-auto sm:px-3" disabled={disabled} onClick={onEdit} aria-label={`${list.name} を編集`} title="編集">
        <Pencil aria-hidden="true" /><span className="hidden sm:inline">編集</span>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" aria-label={`${list.name} のその他の操作`} title="その他の操作">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            <DropdownMenu.Item asChild className={cn(menuItem, 'sm:hidden')}>
              <Link href={`/play?list=${id}`}><Keyboard aria-hidden="true" />このリストを練習</Link>
            </DropdownMenu.Item>
            {practiceCount > 0 && <>
              <DropdownMenu.Item asChild className={menuItem}>
                <Link href={`/rankings?list=${id}`}><Trophy aria-hidden="true" />ベスト記録を見る</Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild className={menuItem}>
                <Link href={`/records?list=${id}`}><History aria-hidden="true" />練習記録を見る<span className="ml-auto text-xs text-muted-foreground tabular-nums">{practiceCount}件</span></Link>
              </DropdownMenu.Item>
            </>}
            <DropdownMenu.Separator className={cn('my-1 h-px bg-border', !practiceCount && 'sm:hidden')} />
            <DropdownMenu.Item className={menuItem} onSelect={onExport}><Download aria-hidden="true" />CSVエクスポート</DropdownMenu.Item>
            <DropdownMenu.Item className={menuItem} disabled={disabled || !canCopy} onSelect={onCopy}><Copy aria-hidden="true" />複製</DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={cn(menuItem, 'text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive')} disabled={disabled} onSelect={onDelete}>
              <Trash2 aria-hidden="true" />削除
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  </li>
}
