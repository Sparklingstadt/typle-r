"use client"
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
export default function InterestPacks({ packs, lists, interests, saving, updateLibrary }: Props) {
  const t = useTranslations('interests.packs')
  const row = useTranslations('wordLists.pack')
  const notify = useSaveNotification()
  // The switches the user moved, by catalog id; the others show whether the pack is followed.
  const [moved, setMoved] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)
  const entries = useMemo(() => catalogEntries({ packs, lists }).filter(entry => matchesInterests(entry.pack, interests)),
    [packs, lists, interests])
  const on = (catalogId: string, followed: boolean) => moved[catalogId] ?? followed
  const choices: CatalogChoice[] = entries.filter(entry => on(entry.catalogId, entry.followed) !== entry.followed)
    .map(entry => ({ catalogId: entry.catalogId, follow: !entry.followed }))
  const unfollowing = entries.filter(entry => entry.followed && !on(entry.catalogId, true))

  async function apply() {
    const saved = await updateLibrary(current =>
      applyCatalogChoices(current, choices, entry => ({ pack: randomId(), lists: entry.lists.map(() => randomId()) })))
    if (saved) {
      const followed = choices.filter(choice => choice.follow).length
      notify(t('done', { followed, unfollowed: choices.length - followed }))
      setMoved({})
    }
    return saved
  }

  if (!interests.length) return <p className="rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground">{t('pick')}</p>
  return <section aria-labelledby="interest-packs" className="space-y-3">
    <div className="space-y-1">
      <h2 id="interest-packs" className="text-base font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
    {!entries.length ? <p className="rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground">{t('none')}</p>
      : <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {entries.map(entry => {
          const words = entry.lists.reduce((sum, list) => sum + list.words.length, 0)
          const id = `interest-pack-${entry.catalogId}`
          return <li key={entry.catalogId} data-catalog-id={entry.catalogId} className="flex items-center gap-4 px-5 py-4">
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
    <div className="sticky bottom-0 -mx-4 flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl sm:px-0">
      <Button disabled={saving || !choices.length} onClick={() => unfollowing.length ? setConfirming(true) : void apply()}>
        <Plus aria-hidden="true" />{t('add')}
      </Button>
    </div>
    {confirming && <DeleteConfirmation open onOpenChange={setConfirming}
      title={t('confirmTitle')} description={t('confirmDescription', { names: unfollowing.map(entry => `「${entry.pack.name}」`).join(t('separator')) })}
      confirmLabel={t('add')} busyLabel={t('adding')}
      onConfirm={async () => {
        const saved = await apply()
        if (saved) setConfirming(false)
        return saved
      }} />}
  </section>
}
