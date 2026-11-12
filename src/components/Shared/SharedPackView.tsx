import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Flag, Plus } from 'lucide-react'
import { ErrorAlert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ReportDialog from '@/components/Gallery/ReportDialog'
import SharedLists from '@/components/Shared/SharedLists'
import { OpenPacks } from '@/components/Shared/SharedStates'
import { api, withQuery } from '@/core/api'
import { MAX_LISTS, ownListCount } from '@/core/listOverview'
import { importPackFile, type PackFile } from '@/core/packFile'
import { randomId } from '@/core/randomId'
import { useErrorText } from '@/i18n/useErrorText'
import { useWordLists } from '@/lib/useWordLists'

export default function SharedPackView({ id, file }: { id: string; file: PackFile }) {
  const t = useTranslations('wordLists')
  const errorText = useErrorText()
  const router = useRouter()
  const { packs, lists, ready, updateLibrary, error } = useWordLists()
  const [adding, setAdding] = useState(false)
  const [failure, setFailure] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const { name, description, category, tags } = file.pack
  const full = ready && ownListCount({ packs, lists }) + file.lists.length > MAX_LISTS

  async function add() {
    setFailure('')
    setAdding(true)
    try {
      const ids = { pack: randomId(), lists: file.lists.map(() => randomId()) }
      // Try the import first so a file that breaks a save rule is refused here, with nothing saved. The screens' lists
      // carry their pack's labels, which a library in the saved shape does not.
      importPackFile({ packs, lists: lists.map(({ group: _group, category: _category, tags: _tags, ...rest }) => rest) }, file, ids)
      if (await updateLibrary(library => importPackFile(library, file, ids))) {
        // Counts the add for the gallery; the server decides whether the share is listed. Not awaited, and a failure is not shown.
        api(withQuery('/api/gallery/added', { id }), { method: 'POST', keepalive: true }).catch(() => {})
        router.push(`/edit?pack=${encodeURIComponent(ids.pack)}`)
      }
    } catch (reason) {
      setFailure(errorText(reason, t('sharedPage.addFailed')))
    } finally { setAdding(false) }
  }

  const message = failure || error
  return <div className="space-y-8">
    <header className="space-y-3">
      <h1 className="text-2xl font-bold">{name}</h1>
      {description ? <p className="max-w-2xl text-sm whitespace-pre-line text-muted-foreground">{description}</p> : null}
      {category || tags?.length ? <div className="flex flex-wrap items-center gap-2">
        {category ? <Badge variant="secondary"><span className="sr-only">{t('labels.category')}: </span>{category}</Badge> : null}
        {tags?.map(tag => <Badge key={tag} variant="outline"><span className="sr-only">{t('labels.tag')}: </span>{tag}</Badge>)}
      </div> : null}
      <p className="max-w-2xl text-sm text-muted-foreground">{t('sharedPage.intro')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready || adding || full} aria-describedby={full ? 'shared-full' : undefined} onClick={() => void add()}><Plus aria-hidden="true" />{t('sharedPage.add')}</Button>
        <OpenPacks />
        <Button variant="ghost" onClick={() => { setReported(false); setReporting(true) }}><Flag aria-hidden="true" />{t('report.open')}</Button>
      </div>
      <ReportDialog shareId={id} open={reporting} onOpenChange={open => { if (open) setReported(false); setReporting(open) }} onSent={() => setReported(true)} />
      <p role="status" className="text-sm text-muted-foreground">{reported ? t('report.sent') : ''}</p>
      {full ? <p id="shared-full" className="text-sm text-muted-foreground">{t('sharedPage.full', { max: MAX_LISTS })}</p> : null}
      {message ? <ErrorAlert>{message}</ErrorAlert> : null}
    </header>

    <SharedLists lists={file.lists} />
  </div>
}
