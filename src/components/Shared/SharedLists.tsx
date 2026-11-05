import { useTranslations } from 'next-intl'
import type { PackFile } from '@/core/packFile'
import { importedLevel } from '@/core/wordPacks'

// The lists of a shared pack, each with all its words, so the pack can be judged before adding it.
export default function SharedLists({ lists }: { lists: PackFile['lists'] }) {
  const t = useTranslations('wordLists')
  return <section aria-labelledby="shared-lists" className="space-y-6">
    <h2 id="shared-lists" className="text-base font-bold">{t('sharedPage.lists')}</h2>
    {lists.map((list, n) => <div key={n} className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-bold">{list.name}</h3>
        <p className="text-sm text-muted-foreground">
          {/* Levels a share made before v0.97.0 may hold several, shown joined into one as they are imported. */}
          {importedLevel(list.levels) ? t('sharedPage.levels', { levels: importedLevel(list.levels)! }) : t('packEditor.noLevels')}
          {' · '}{t('packEditor.wordCount', { count: list.words.length })}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table aria-label={list.name} className="w-full text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">{t('editor.display')}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t('editor.input')}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t('editor.annotation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.words.map((word, row) => <tr key={row}>
              <td className="px-4 py-2">{word.display}</td>
              <td className="px-4 py-2 font-mono">{word.input}</td>
              <td className="px-4 py-2 text-muted-foreground">{word.annotation}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>)}
  </section>
}
