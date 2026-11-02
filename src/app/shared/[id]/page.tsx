"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CircleAlert, Flag, Plus } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import ReportDialog from "@/components/Gallery/ReportDialog"
import { graphql } from "@/core/graphql"
import { MAX_LISTS } from "@/core/listOverview"
import { decodePackFile, importPackFile, type PackFile } from "@/core/packFile"
import { randomId } from "@/core/randomId"
import { importedLevel } from "@/core/wordPacks"
import { useErrorText } from "@/i18n/useErrorText"
import { useWordLists } from "@/lib/useWordLists"

// A shared pack is public: this page sits outside the (workspace) group, so it opens without a login or the workspace
// gate. The root layout's WorkspaceProvider still gives it the signed-in account's library, or the guest's.
type Shared =
  | { state: 'loading' }
  | { state: 'ended' }
  | { state: 'failed'; reason: unknown }
  | { state: 'ready'; file: PackFile }

export default function SharedPack() {
  const { id } = useParams<{ id: string }>()
  const [shared, setShared] = useState<Shared>({ state: 'loading' })
  useEffect(() => {
    let active = true
    const show = (next: Shared) => { if (active) setShared(next) }
    // The file comes as the JSON value it was stored as, and null once the link is stopped.
    graphql<{ sharedPack: unknown }>('query SharedPack($id: String!) { sharedPack(id: $id) }', { id }).then(({ sharedPack }) => {
      if (sharedPack === null) return show({ state: 'ended' })
      show({ state: 'ready', file: decodePackFile(JSON.stringify(sharedPack)) })
    }).catch(reason => show({ state: 'failed', reason }))
    return () => { active = false }
  }, [id])

  return <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    {shared.state === 'loading' ? <Loading />
      : shared.state === 'ended' ? <Ended />
      : shared.state === 'failed' ? <Failed reason={shared.reason} />
      : <Pack id={id} file={shared.file} />}
  </main>
}

function Loading() {
  const t = useTranslations('wordLists.sharedPage')
  return <div role="status" aria-label={t('loading')} className="space-y-3">
    <Skeleton className="h-8 w-1/2" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-40 w-full" />
  </div>
}

function OpenPacks() {
  const t = useTranslations('wordLists.sharedPage')
  return <Button asChild variant="outline"><Link href="/edit">{t('toPacks')}</Link></Button>
}

function Ended() {
  const errors = useTranslations('errors')
  return <div className="space-y-4">
    <p role="status" className="text-lg font-bold">{errors('sharedPackNotFound')}</p>
    <OpenPacks />
  </div>
}

function Failed({ reason }: { reason: unknown }) {
  const t = useTranslations('wordLists.sharedPage')
  const errorText = useErrorText()
  return <div className="space-y-4">
    <Alert variant="destructive"><CircleAlert aria-hidden="true" />
      <AlertDescription>{errorText(reason, t('loadFailed'))}</AlertDescription>
    </Alert>
    <OpenPacks />
  </div>
}

function Pack({ id, file }: { id: string; file: PackFile }) {
  const t = useTranslations('wordLists')
  const errorText = useErrorText()
  const router = useRouter()
  const { packs, lists, ready, updateLibrary, error } = useWordLists()
  const [adding, setAdding] = useState(false)
  const [failure, setFailure] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const { name, description, category, tags } = file.pack
  const full = ready && lists.length + file.lists.length > MAX_LISTS

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
        graphql('mutation CountAdded($id: String!) { countAdded(id: $id) }', { id }, { keepalive: true }).catch(() => {})
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
      {full ? <p id="shared-full" className="text-sm text-muted-foreground">{t('catalog.full', { max: MAX_LISTS })}</p> : null}
      {message ? <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert> : null}
    </header>

    <section aria-labelledby="shared-lists" className="space-y-6">
      <h2 id="shared-lists" className="text-base font-bold">{t('sharedPage.lists')}</h2>
      {file.lists.map((list, n) => <div key={n} className="space-y-2">
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
  </div>
}
