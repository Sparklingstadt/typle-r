"use client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import DeleteConfirmation from "@/components/DeleteConfirmation"
import { useSaveNotification } from "@/components/SaveNotification"
import Link from "next/link"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"
import { useWordLists } from "@/lib/useWordLists"

import { deviceLabel } from "@/lib/devices"
import { recentRecords, removeRecord } from "@/lib/records"

export default function Records() {
  const notify = useSaveNotification()
  const { lists, ready, error, update } = useWordLists()
  const rows = recentRecords(lists)
  return <Page><PageContainer>
    <h1 className="text-2xl mb-6">練習記録</h1>
    <p>ログイン中のアカウントに保存した記録です。単語数は練習時点の値です。</p>
    {error && <Alert variant="destructive" className="my-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {!ready ? <p>読み込み中…</p> : !rows.length ? <p className="my-6">まだ記録がありません。<Link className="underline" href="/play">練習を始める</Link></p> :
      <div className="overflow-x-auto my-6"><Table className="w-full text-left">
        <TableHeader><TableRow>{['リスト', '所要時間', '単語数', 'ミス数', '正確率', '端末', '日時', '操作'].map(title => <TableHead className="p-3" key={title}>{title}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map(({ list, record, index }) => <TableRow className="border-t" key={`${list.id}-${record.id ?? index}`}>
          <TableCell className="p-3 font-medium">{list.name}</TableCell><TableCell>{record.time.toFixed(2)} 秒</TableCell><TableCell>{record.wordCount ?? '—'}</TableCell>
          <TableCell>{record.mistakes ?? '—'}</TableCell><TableCell>{record.accuracy === undefined ? '—' : `${record.accuracy}%`}</TableCell>
          <TableCell className="whitespace-normal break-words">{deviceLabel(record.device)}</TableCell>
          <TableCell>{new Date(record.date).toLocaleString('ja-JP')}</TableCell>
          <TableCell><DeleteConfirmation label={`${list.name} の ${new Date(record.date).toLocaleString('ja-JP')} の記録を削除`}
            description={`${list.name} の ${new Date(record.date).toLocaleString('ja-JP')} の練習記録を削除します。`}
            onConfirm={async () => {
              const saved = await update(current => removeRecord(current, list.id, record))
              if (saved) notify(`「${list.name}」の ${new Date(record.date).toLocaleString('ja-JP')} の練習記録を削除しました。`)
              return saved
            }} /></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
  </PageContainer></Page>
}
