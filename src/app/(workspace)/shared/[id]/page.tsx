"use client"
import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CircleAlert, Copy, List } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import PageStorageBadge from "@/components/PageStorageBadge"
import { useSaveNotification } from "@/components/SaveNotification"
import { useWordLists } from "@/lib/useWordLists"
import { useSharedList } from "@/lib/useSharedList"
import { useErrorText } from "@/i18n/useErrorText"
import { randomId } from "@/core/randomId"
import { copySharedList } from "@/core/sharedLists"

// What a share link opens: the list's words, and a button that adds a copy to the reader's own lists,
// in this browser for a guest or the account for a login.
export default function SharedListPage() {
  const { id } = useParams<{ id: string }>()
  const t = useTranslations('shared')
  const lists = useTranslations('wordLists')
  const errorText = useErrorText()
  const router = useRouter()
  const notify = useSaveNotification()
  const { update, saving, error, storage } = useWordLists()
  const { list, error: loadError, loading } = useSharedList(id)
  const [failed, setFailed] = useState(false)

  async function copy() {
    if (!list) return
    const copyId = randomId()
    let name = ''
    const saved = await update(current => {
      const result = copySharedList(current, list, copyId, n => lists('page.copySuffix', { n }))
      name = result.copy.name
      return result.lists
    })
    setFailed(!saved)
    if (saved) {
      notify(t('copied', { name }))
      router.push(`/edit?list=${encodeURIComponent(copyId)}`)
    }
  }

  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
    {loading ? <div role="status" className="space-y-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-72 max-w-full" /><Skeleton className="h-40 w-full" /></div>
      : !list ? <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          {loadError?.key === 'sharedListNotFound' ? t('notFound') : errorText(loadError, t('loadFailed'))}
        </p>
        <Button asChild variant="outline"><Link href="/edit"><List aria-hidden="true" />{t('toLists')}</Link></Button>
      </div>
      : <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{t('title')}</p>
            <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{list.name}</h1>
            <p className="text-sm text-muted-foreground tabular-nums">{t('wordCount', { count: list.words.length })}</p>
          </div>
          <PageStorageBadge storage={storage} />
        </header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="lg" disabled={saving} onClick={copy}><Copy aria-hidden="true" />{t('copy')}</Button>
          <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">{t('note')}</p>
        </div>
        {failed && error && <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <CircleAlert aria-hidden="true" /><AlertDescription>{error}</AlertDescription>
        </Alert>}
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t('columns.display')}</TableHead><TableHead>{t('columns.input')}</TableHead><TableHead>{t('columns.annotation')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {list.words.map((word, index) => <TableRow key={index}>
                <TableCell className="whitespace-pre-wrap [overflow-wrap:anywhere]">{word.display}</TableCell>
                <TableCell className="whitespace-pre-wrap [overflow-wrap:anywhere]">{word.input}</TableCell>
                <TableCell className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{word.annotation}</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </div>}
  </main>
}
