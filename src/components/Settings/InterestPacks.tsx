"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ListMinus, ListPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyNote } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import DeleteConfirmation from '@/components/DeleteConfirmation'
import { useSaveNotification } from '@/components/SaveNotification'
import { matchesInterests } from '@/core/interests'
import { randomId } from '@/core/randomId'
import type { SavedWordList } from '@/core/wordLists'
import type { Library, WordPack } from '@/core/wordPacks'
import { applyCatalogChoices, catalogEntries, type CatalogChoice } from '@/plugins/packs/catalog'

type Props = {
  packs: WordPack[]
  lists: SavedWordList[]
  interests: string[]
  saving: boolean
  updateLibrary: (change: (library: Library) => Library) => Promise<boolean>
}

// The official packs that fit the chosen interests, each with a switch: on for a followed pack, off for the others.
// 追加 follows the packs switched on and unfollows the followed packs switched off, asking first when it unfollows.
// Each pack also has a checkbox: the bar at the bottom follows or unfollows every checked pack at once.
export default function InterestPacks({ packs, lists, interests, saving, updateLibrary }: Props) {
  const t = useTranslations('interests.packs')
  const row = useTranslations('wordLists.pack')
  const notify = useSaveNotification()
  // The switches the user moved, by catalog id; the others show whether the pack is followed.
  const [moved, setMoved] = useState<Record<string, boolean>>({})
  // The catalog ids of the checked packs. A pack that leaves the list stays here but is not counted.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  // The change waiting for the confirmation because it unfollows packs, with the label of the button that asked.
  const [confirming, setConfirming] = useState<{ choices: CatalogChoice[], label: string } | null>(null)
  const entries = useMemo(() => catalogEntries({ packs, lists }).filter(entry => matchesInterests(entry.pack, interests)),
    [packs, lists, interests])
  const on = (catalogId: string, followed: boolean) => moved[catalogId] ?? followed
  const choices: CatalogChoice[] = entries.filter(entry => on(entry.catalogId, entry.followed) !== entry.followed)
    .map(entry => ({ catalogId: entry.catalogId, follow: !entry.followed }))
  const selected = entries.filter(entry => checked.has(entry.catalogId))
  const toFollow: CatalogChoice[] = selected.filter(entry => !entry.followed).map(entry => ({ catalogId: entry.catalogId, follow: true }))
  const toUnfollow: CatalogChoice[] = selected.filter(entry => entry.followed).map(entry => ({ catalogId: entry.catalogId, follow: false }))
  const all = useRef<HTMLInputElement>(null)
  const some = selected.length > 0 && selected.length < entries.length
  useEffect(() => { if (all.current) all.current.indeterminate = some }, [some])

  async function apply(change: CatalogChoice[]) {
    const saved = await updateLibrary(current =>
      applyCatalogChoices(current, change, entry => ({ pack: randomId(), lists: entry.lists.map(() => randomId()) })))
    if (saved) {
      const followed = change.filter(choice => choice.follow).length
      notify(t('done', { followed, unfollowed: change.length - followed }))
      // The applied packs show whether they are followed again, and leave the selection.
      const applied = new Set(change.map(choice => choice.catalogId))
      setMoved(current => Object.fromEntries(Object.entries(current).filter(([catalogId]) => !applied.has(catalogId))))
      setChecked(current => new Set([...current].filter(catalogId => !applied.has(catalogId))))
    }
    return saved
  }

  // Applies a change at once, or asks first when it unfollows a pack.
  function request(change: CatalogChoice[], label: string) {
    if (change.some(choice => !choice.follow)) setConfirming({ choices: change, label })
    else void apply(change)
  }

  function check(catalogId: string, value: boolean) {
    setChecked(current => {
      const next = new Set(current)
      if (value) next.add(catalogId)
      else next.delete(catalogId)
      return next
    })
  }

  if (!interests.length) return <EmptyNote>{t('pick')}</EmptyNote>
  return <section aria-labelledby="interest-packs" className="space-y-3">
    <div className="space-y-1">
      <h2 id="interest-packs" className="text-base font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
    {!entries.length ? <EmptyNote>{t('none')}</EmptyNote>
      : <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {entries.map(entry => {
          const words = entry.lists.reduce((sum, list) => sum + list.words.length, 0)
          const id = `interest-pack-${entry.catalogId}`
          return <li key={entry.catalogId} data-catalog-id={entry.catalogId} className="flex items-center gap-4 px-5 py-4">
            <input type="checkbox" aria-label={t('select', { name: entry.pack.name })} disabled={saving}
              checked={checked.has(entry.catalogId)} onChange={event => check(entry.catalogId, event.target.checked)}
              className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed" />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 id={id} className="font-bold [overflow-wrap:anywhere]">{entry.pack.name}</h3>
              <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                <span className="sr-only">{t('lists')}: </span>{entry.lists.map(list => list.name).join(t('separator'))}
              </p>
              <p className="text-[13px] text-muted-foreground tabular-nums">{row('wordCount', { count: words })}</p>
            </div>
            <Switch aria-label={t('switch', { name: entry.pack.name })} disabled={saving}
              checked={on(entry.catalogId, entry.followed)}
              onCheckedChange={checked => setMoved(current => ({ ...current, [entry.catalogId]: checked }))} />
          </li>
        })}
      </ul>}
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl">
      {entries.length > 0 && <label className="mr-auto flex cursor-pointer items-center gap-2.5 text-sm">
        <input ref={all} type="checkbox" disabled={saving} checked={selected.length === entries.length}
          onChange={event => setChecked(event.target.checked ? new Set(entries.map(entry => entry.catalogId)) : new Set())}
          className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed" />
        <span>{t('selectAll')}</span>
        <span className="text-muted-foreground tabular-nums" aria-live="polite">{t('selected', { count: selected.length })}</span>
      </label>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={saving || !toFollow.length} onClick={() => request(toFollow, t('followSelected'))}>
          <ListPlus aria-hidden="true" />{t('followSelected')}
        </Button>
        <Button variant="outline" disabled={saving || !toUnfollow.length} onClick={() => request(toUnfollow, t('unfollowSelected'))}>
          <ListMinus aria-hidden="true" />{t('unfollowSelected')}
        </Button>
        <Button disabled={saving || !choices.length} onClick={() => request(choices, t('add'))}>
          <Plus aria-hidden="true" />{t('add')}
        </Button>
      </div>
    </div>
    {confirming && <DeleteConfirmation open onOpenChange={open => { if (!open) setConfirming(null) }}
      title={t('confirmTitle')} description={t('confirmDescription', { names: entries
        .filter(entry => confirming.choices.some(choice => !choice.follow && choice.catalogId === entry.catalogId))
        .map(entry => `「${entry.pack.name}」`).join(t('separator')) })}
      confirmLabel={confirming.label} busyLabel={t('saving')}
      onConfirm={async () => {
        const saved = await apply(confirming.choices)
        if (saved) setConfirming(null)
        return saved
      }} />}
  </section>
}
