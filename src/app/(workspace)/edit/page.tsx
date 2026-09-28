"use client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useState } from "react"
import Link from "next/link"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { Button } from "@/components/ui/button"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import WordListEditor from "@/components/WordListEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { GUEST_ACCOUNT_ID } from "@/lib/guestWorkspace"
import WordListExport from "@/components/WordListExport"
import { useSaveNotification } from "@/components/SaveNotification"
import { useWordLists } from "@/lib/useWordLists"
import { SavedWordList, saveList } from "@/lib/wordLists"

export default function Edit() {
  const notify = useSaveNotification()
  const { lists, ready, error, saving, update, accountId } = useWordLists()
  const [editing, setEditing] = useState<SavedWordList | null>(null)
  if (ready && editing) return <WordListEditorPage>
    <WordListEditor key={editing.id} title="単語リストを編集" storage={accountId === GUEST_ACCOUNT_ID ? "browser" : "account"} initial={editing} error={error}
      onCancel={() => setEditing(null)} onSave={async list => {
        const saved = await update(current => saveList(current, list, true))
        if (saved) { setEditing(null); notify(`「${list.name}」を更新しました。`) }
        return saved
      }} />
  </WordListEditorPage>
  return <Page><PageContainer>
    <h1 className="text-2xl mb-6">単語リストの編集</h1>
    {error && <Alert variant="destructive" className="my-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {!ready ? <p>読み込み中…</p> : <>
      <Link href="/create" className="underline">新しい単語リストを作成</Link>
      <p className="mt-3 text-sm text-muted-foreground">CSVエクスポートで表示・入力・補足を保存できます。練習記録は含みません。「作成」「編集」のCSV取り込みで再利用できます。</p>
      {!lists.length && <p className="my-6">単語リストがありません。</p>}
      <div className="overflow-x-auto my-6"><Table className="w-full text-left">
        <TableHeader><TableRow><TableHead className="p-3">単語リスト名</TableHead><TableHead>単語数</TableHead><TableHead>記録数</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
        <TableBody>{lists.map(list => <TableRow key={list.id} className="border-t">
          <TableCell className="p-3 font-medium">{list.name}</TableCell><TableCell>{list.words.length}単語</TableCell><TableCell>{list.records.length}記録</TableCell>
          <TableCell><div className="flex flex-wrap items-center gap-2"><Button onClick={() => setEditing(list)} aria-label={`${list.name} を編集`}>編集</Button>
            <WordListExport list={list} disabled={saving || !!error} />
            <DeleteConfirmation label={`${list.name} を削除`} description={`「${list.name}」とその練習記録を削除します。`} onConfirm={async () => {
              const saved = await update(current => current.filter(item => item.id !== list.id))
              if (saved) notify(`「${list.name}」を削除しました。`)
              return saved
            }} /></div></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </>}
  </PageContainer></Page>
}
