"use client"
import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { CircleAlert, Library as LibraryIcon, RotateCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useSaveNotification } from "@/components/SaveNotification"
import WordListEditor from "@/components/WordListEditor"
import { usePracticeText } from "@/components/WordLists/ListRow"
import ListManager from "@/components/WordLists/ListManager"
import ListsLoading from "@/components/WordLists/ListsLoading"
import Notice from "@/components/WordLists/Notice"
import { useEditorRoute } from "@/lib/useEditorRoute"
import { useRowHighlight } from "@/lib/useRowHighlight"
import { useWordLists, type Workspace } from "@/lib/useWordLists"
import { listOverviews } from "@/core/listOverview"
import { isFollowed, ownPacks } from "@/core/followedPacks"
import { loneListPack, saveListInPack } from "@/core/packEditing"
import PageStorageBadge from "@/components/PageStorageBadge"
import type { WorkspaceLocation } from "@/core/workspaceStore"
import { PageHeader, PageMain } from "@/components/ui/page-layout"

export default function Edit() {
  const workspace = useWordLists()
  return <PageMain width="medium">
    {!workspace.ready ? <ListsLoading />
      : <Suspense fallback={<ListsLoading />}><WordLists key={workspace.accountId} workspace={workspace} /></Suspense>}
  </PageMain>
}

function Header({ storage }: { storage?: WorkspaceLocation }) {
  const t = useTranslations('wordLists.page')
  return <PageHeader title={t('title')} description={t('description')}>
    <div className="flex items-center gap-2">
      <Button asChild variant="outline"><Link href="/packs/catalog"><LibraryIcon aria-hidden="true" />{t('catalog')}</Link></Button>
      <PageStorageBadge storage={storage} />
    </div>
  </PageHeader>
}

function WordLists({ workspace }: { workspace: Workspace }) {
  const { lists, packs, error, errorKey, saving, update, updateLibrary, storage } = workspace
  const t = useTranslations('wordLists.page')
  const errors = useTranslations('errors')
  const practiceText = usePracticeText()
  const notify = useSaveNotification()
  const params = useSearchParams()
  const urlId = params.get('list')
  const { openId, cancelRequest, open, close, trackDirty } = useEditorRoute(urlId)
  const [highlight, setHighlight] = useRowHighlight('data-list-id')
  // `/edit?pack=<id>` (from the pack screens, after saving) opens that pack and points at its row.
  const packId = params.get('pack')
  const [seenPack, setSeenPack] = useState<string | null>(null)
  const [highlightPack, setHighlightPack] = useRowHighlight('data-pack-id', !!openId)
  // The open packs stay open while a list is edited, so the row is there to return to.
  const [openPacks, setOpenPacks] = useState<Set<string>>(() => new Set())
  if (packId !== seenPack) {
    setSeenPack(packId)
    if (packId) {
      setHighlightPack(packId)
      setOpenPacks(current => new Set([...current, packId]))
    }
  }
  const editing = lists.find(list => list.id === openId)

  // Moving the only list of a pack to another pack deletes that pack, which the editor says when another pack is chosen.
  const lonePack = loneListPack({ packs, lists }, editing?.packId)
  const editingPack = editing ? packs.find(pack => pack.id === editing.packId) : undefined
  // The lists of a followed pack are not edited: the notice replaces the editor, with the way back.
  if (openId && editing && editingPack && isFollowed(editingPack)) {
    return <Notice link={{ href: `/edit?pack=${encodeURIComponent(editingPack.id)}`, label: t('title') }}>{errors('packFollowed')}</Notice>
  }
  if (openId && editing) return <WordListEditor key={editing.id} title={t('editTitle')} initial={editing} packs={ownPacks(packs)} packId={editing.packId ?? null} error={error} errorKey={errorKey}
    lonePackName={lonePack?.name}
    description={t('editDescription', { count: editing.words.length, practice: practiceText(listOverviews([editing])[0], new Date()) })}
    storage={storage} onDirtyChange={trackDirty} cancelRequest={cancelRequest}
    onCancel={() => close()} onSave={async (list, packId) => {
      let target = packId
      const saved = await updateLibrary(library => {
        const next = saveListInPack(library, { id: list.id, name: list.name, words: list.words, levels: list.levels, ...(list.writing ? { writing: list.writing } : {}), createdAt: list.createdAt }, packId, true)
        target = next.lists.find(item => item.id === list.id)?.packId ?? packId
        return next
      })
      if (saved) {
        // The list's pack, possibly a new one, is opened so the row is there to return to.
        if (target) setOpenPacks(current => new Set([...current, target!]))
        close()
        setHighlight(list.id)
        notify(t('updated', { name: list.name.trim() }))
      }
      return saved
    }} />

  return <>
    <Header storage={storage} />
    {error && <Alert variant="destructive" className="mb-6 border-destructive/40 bg-destructive/5">
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-64">{error}</span>
        <Button variant="outline" size="lg" onClick={() => window.location.reload()}><RotateCw aria-hidden="true" />{t('reload')}</Button>
      </AlertDescription>
    </Alert>}
    {openId && !editing && <Alert className="mb-6">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{t('notFound')}</AlertDescription>
    </Alert>}
    {/* After a failed load the lists are unknown; "no lists yet" would be wrong. */}
    {!(error && !lists.length) && <ListManager lists={lists} packs={packs} saving={saving} highlight={highlight} highlightPack={highlightPack}
      update={update} updateLibrary={updateLibrary} notify={notify}
      onShowPack={id => { setHighlightPack(id); setOpenPacks(current => new Set([...current, id])) }}
      openPacks={openPacks} onOpenPacksChange={setOpenPacks} onEdit={open} onHighlight={setHighlight} />}
  </>
}
