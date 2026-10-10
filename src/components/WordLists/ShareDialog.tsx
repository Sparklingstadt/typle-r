"use client"
import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Switch } from 'radix-ui'
import { Check, CircleAlert, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useWordLists } from '@/lib/useWordLists'
import type { SavedWordList } from '@/core/wordLists'

function withSharing(list: SavedWordList, shared: boolean): SavedWordList {
  const { shared: _shared, shareId: _shareId, ...rest } = list
  return shared ? { ...rest, shared: true } : rest
}

// Turns link sharing of one list on or off and shows the link. The change is saved at once, like 複製 and 削除.
export default function ShareDialog({ listId, open, onOpenChange }: { listId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('wordLists.share')
  const { lists, update, saving, error } = useWordLists()
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)
  const [failed, setFailed] = useState(false)
  const switchId = useId()
  const linkId = useId()
  // The saved list, not the one the dialog opened with, so the link appears once the server has issued it.
  const list = lists.find(item => item.id === listId)
  const url = list?.shareId ? `${window.location.origin}/shared/${list.shareId}` : ''

  useEffect(() => {
    if (copied !== 'done') return
    const timer = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function toggle(shared: boolean) {
    setCopied(null)
    setFailed(!await update(current => current.map(item => item.id === listId ? withSharing(item, shared) : item)))
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setCopied('done') }
    catch { setCopied('failed') }
  }

  return <Dialog open={open && !!list} onOpenChange={value => { if (!value) { setCopied(null); setFailed(false) } onOpenChange(value) }}>
    {list && <DialogContent>
      <DialogHeader>
        <DialogTitle className="pr-8 [overflow-wrap:anywhere]">{t('title', { name: list.name })}</DialogTitle>
        <DialogDescription>{t('note')}</DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between gap-4 rounded-lg border px-3.5 py-3">
        <label htmlFor={switchId} className="text-sm font-medium">{t('toggle')}</label>
        <Switch.Root id={switchId} checked={!!list.shared} disabled={saving} onCheckedChange={toggle}
          className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-input outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-[state=checked]:bg-primary">
          <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-[1.375rem]" />
        </Switch.Root>
      </div>
      {list.shared && (url ? <div className="space-y-1.5">
        <label htmlFor={linkId} className="text-sm font-medium">{t('link')}</label>
        <div className="flex gap-2">
          <input id={linkId} readOnly value={url} onFocus={event => event.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-muted/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          <Button variant="outline" size="lg" onClick={copyLink}>
            {copied === 'done' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied === 'done' ? t('copied') : t('copyLink')}
          </Button>
        </div>
        {copied === 'failed' && <p role="alert" className="text-sm text-destructive">{t('copyFailed')}</p>}
      </div> : <p role="status" className="text-sm text-muted-foreground">{t('preparing')}</p>)}
      {failed && error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{error}</p>}
    </DialogContent>}
  </Dialog>
}
