"use client"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { downloadPackFile, downloadWordCsv } from "@/components/WordListExport"
import type { Workspace } from "@/lib/useWordLists"
import { useErrorText } from "@/i18n/useErrorText"
import { AppError } from "@/core/appError"
import { MAX_IMPORT_BYTES } from "@/core/wordFormat"
import { copyPack, decodePackFile, encodePackFile, importPackFile } from "@/core/packFile"
import { randomId } from "@/core/randomId"
import { duplicateList } from "@/core/listOverview"
import { storedLibrary, type PackOverview } from "@/core/packEditing"
import type { SavedWordList } from "@/core/wordLists"
import type { Library } from "@/core/wordPacks"

export function useListActions({ packs, lists, update, updateLibrary, notify, onPackCreated, onListCopied }: {
  packs: Workspace['packs']
  lists: SavedWordList[]
  update: Workspace['update']
  updateLibrary: Workspace['updateLibrary']
  notify: (message: string) => void
  /** Clears the search and the filter, then opens the pack. */
  onPackCreated: (id: string) => void
  /** Clears the search, then points at the list. */
  onListCopied: (id: string) => void
}) {
  const t = useTranslations('wordLists')
  const errorText = useErrorText()
  const [exportError, setExportError] = useState('')

  function exportCsv(list: SavedWordList) {
    setExportError(downloadWordCsv(list) ? '' : t('page.exportFailed', { name: list.name }))
  }

  function exportPack(item: PackOverview) {
    const library = { packs, lists }
    setExportError(downloadPackFile(item.pack.name, encodePackFile(library, item.pack.id)) ? '' : t('page.exportFailed', { name: item.pack.name }))
  }

  // The new pack is the one the change added; its name is read back from the saved library.
  async function savePack(change: (library: Library, ids: { pack: string; lists: string[] }) => Library, listCount: number,
    ids = { pack: randomId(), lists: Array.from({ length: listCount }, () => randomId()) }) {
    let name = ''
    const saved = await updateLibrary(library => {
      const next = change(library, ids)
      name = next.packs.find(pack => pack.id === ids.pack)?.name ?? ''
      return next
    })
    if (saved) {
      // Clear the search so the new pack is in view, then open it.
      onPackCreated(ids.pack)
      notify(t('page.created', { name }))
    }
  }

  function copyPackOf(item: PackOverview) {
    return savePack((library, ids) => copyPack(library, item.pack.id, ids, n => t('page.copySuffix', { n })), item.lists.length)
  }

  // A file that cannot be read, or is too large, is refused here and nothing is saved.
  async function importFile(file: File) {
    setExportError('')
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new AppError('importTooLarge')
      const decoded = decodePackFile(await file.text())
      // A file that breaks a save rule is refused here too, on this line, with nothing saved. The screens' lists carry
      // their pack's labels, which a library in the saved shape does not.
      const ids = { pack: randomId(), lists: decoded.lists.map(() => randomId()) }
      importPackFile(storedLibrary({ packs, lists }), decoded, ids)
      await savePack((library, same) => importPackFile(library, decoded, same), decoded.lists.length, ids)
    } catch (reason) {
      setExportError(errorText(reason, t('import.readFailed')))
    }
  }

  async function copyList(list: SavedWordList) {
    const copyId = randomId()
    let name = ''
    const saved = await update(current => {
      const result = duplicateList(current, list.id, copyId, n => t('page.copySuffix', { n }))
      name = result.copy.name
      return result.lists
    })
    if (saved) {
      // Clear the search so the copy is in view, then point at it.
      onListCopied(copyId)
      notify(t('page.created', { name }))
    }
  }

  return { error: exportError, exportCsv, exportPack, copyPackOf, copyList, importFile }
}
