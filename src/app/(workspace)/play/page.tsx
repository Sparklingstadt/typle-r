"use client"
import { useState } from "react"
import { deviceLabel, type PracticeDevice } from "@/lib/devices"
import DeviceSelector from "@/components/DeviceSelector"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useWordLists } from "@/lib/useWordLists"
import type { SavedWordList } from "@/lib/wordLists"
import { usePractice } from "@/lib/usePractice"
import BestRecordsTable from "@/components/BestRecordsTable"
import type { WorkspaceUpdate } from "@/lib/workspaceClient"
import Page from "@/components/Page/Page"
import PageContainer from "@/components/PageContainer/PageContainer"

export default function Play() {
  const { lists, devices, accountId, ready, error, update } = useWordLists()
  if (!ready) return <Page><PageContainer><p>読み込み中…</p></PageContainer></Page>
  return <Practice key={accountId} accountId={accountId ?? ""} devices={devices} wordLists={lists} error={error} update={update} />
}

function Practice({ wordLists, error, update, devices, accountId }: {
  devices: PracticeDevice[]
  accountId: string
  wordLists: SavedWordList[]
  error: string
  update: WorkspaceUpdate
}) {
  const storageKey = `typle-r:device:${accountId}`
  const [deviceId, setDeviceId] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? '' } catch { return '' }
  })
  const device = devices.find(item => item.id === deviceId)
  const { list, selected, session, practiceDevice, composition, startComposition, endComposition, changeInput, saved, input, word, finished, result, restart, retrySave } = usePractice(wordLists, update, device)
  const typedCharacters = Array.from(composition ?? session.input)
  const selectedRecords = wordLists.find(item => item.id === list?.id)?.records ?? []

  return <Page className="pb-12"><PageContainer className={finished ? undefined : "pt-0 sm:pt-0 lg:pt-0"}>
    {error && <Alert variant="destructive" className="my-4"><AlertDescription>{error}</AlertDescription></Alert>}
    {!list?.words.length ? <p>単語がありません。単語リストを作成してください。</p> : <>
      {!finished && <>
        <div className="relative -mx-5 sm:-mx-8 lg:-mx-16">
        {word?.annotation && <p className="absolute inset-x-4 top-2 z-10 text-base text-center text-foreground break-words">{word.annotation}</p>}
        <div id="wordDisplay" className="bg-muted text-foreground h-28 px-8 text-4xl leading-none text-center whitespace-nowrap overflow-x-auto flex items-center justify-center">
          {Array.from(word?.display ?? "").map((char, index) => {
            const typed = typedCharacters[index]
            return <span key={index} className={typed === undefined ? "" : typed === char ? "text-green-700 dark:text-green-400 underline" : "text-red-700 dark:text-red-400 underline"}>{char}</span>
          })}
        </div>
        </div>
      </>}
      <div className="-mx-5 sm:-mx-8 lg:-mx-16">
      <Input ref={input} id="wordInputField" className={`border rounded-none h-28 px-8 py-0 w-full text-4xl md:text-4xl leading-none text-center focus-visible:border-input focus-visible:ring-0 aria-invalid:border-input aria-invalid:ring-0 dark:aria-invalid:border-input ${finished ? "hidden" : ""}`}
        placeholder="ここに単語を入力"
        value={composition ?? session.input} disabled={finished} autoComplete="off" autoCapitalize="off" spellCheck={false}
        aria-label="表示された文字を入力" aria-invalid={!!session.input && !word?.input.startsWith(session.input)}
        onPaste={event => event.preventDefault()} onDrop={event => event.preventDefault()}
        onCompositionStart={startComposition}
        onCompositionEnd={event => endComposition(event.currentTarget.value)}
        onChange={event => changeInput(event.target.value, (event.nativeEvent as InputEvent).isComposing)} />
      </div>
      {!finished && <ul className="mt-4 flex flex-wrap gap-2" aria-label="単語の進捗">
        {list.words.map((item, index) => {
          const completed = finished || index < session.index
          return <li key={index} className="max-w-full">
            <Badge variant="secondary"
              className={`h-auto max-w-full whitespace-normal break-all px-3 py-1 text-sm ${completed ? 'bg-green-100 text-green-800 border-green-300' : ''}`}
              aria-current={!finished && index === session.index ? 'step' : undefined}>
              {item.display}<span className="sr-only">{completed ? '（完了）' : index === session.index ? '（入力中）' : '（未入力）'}</span>
            </Badge>
          </li>
        })}
      </ul>}
      {finished ? <h1 className="text-2xl mb-6">練習完了：{list.name}</h1>
        : <p className="my-4" role="status">{`${session.index + 1} / ${list.words.length} 単語`}</p>}
      {finished && <Card aria-label="練習結果" className="my-6"><CardContent className="space-y-2">
        <h2 className="text-xl">おつかれさまでした！</h2>
        <Table aria-label="練習結果の詳細">
          <TableBody>
            <TableRow><TableHead scope="row">端末</TableHead><TableCell className="whitespace-normal break-words">{deviceLabel(practiceDevice)}</TableCell></TableRow>
            <TableRow><TableHead scope="row">完了した単語数</TableHead><TableCell>{list.words.length} 単語</TableCell></TableRow>
            <TableRow><TableHead scope="row">所要時間</TableHead><TableCell>{result.time.toFixed(2)} 秒</TableCell></TableRow>
            <TableRow><TableHead scope="row">ミス数</TableHead><TableCell>{result.mistakes} 文字</TableCell></TableRow>
            <TableRow><TableHead scope="row">正確率</TableHead><TableCell>{result.accuracy}%</TableCell></TableRow>
          </TableBody>
        </Table>
        <p role="status">{saved ? "練習記録を保存しました。" : "記録はまだ保存されていません。"}</p>
        {!saved && <Button onClick={retrySave}>記録の保存を再試行</Button>}
      </CardContent></Card>}
    </>}
    {!finished && <DeviceSelector devices={session.startedAt !== null ? (practiceDevice ? [practiceDevice] : []) : devices} selectedId={(session.startedAt !== null ? practiceDevice : device)?.id ?? ''} disabled={session.startedAt !== null} onChange={id => {
      setDeviceId(id)
      try { localStorage.setItem(storageKey, id) } catch { /* Selection still works when browser storage is unavailable. */ }
      input.current?.focus()
    }} />}
    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
    <section className="min-w-0" aria-label="選択中リストのベスト記録">
      <h2 className="mb-3 text-xl">ベスト記録</h2>
      <BestRecordsTable records={selectedRecords} label="ベスト記録 上位5件" />
    </section>
    <section className="min-w-0" aria-label="単語リストの選択">
    <h2 className="mb-3 text-xl">単語リスト</h2>
    <Table aria-label="単語リスト">
      <TableHeader><TableRow><TableHead scope="col">単語リスト名</TableHead><TableHead scope="col" className="w-24 text-right">選択</TableHead></TableRow></TableHeader>
      <TableBody>
        {wordLists.map((item, index) => <TableRow key={item.id}>
          <TableHead scope="row" className="whitespace-normal break-all">{item.name}</TableHead>
          <TableCell className="text-right">
            <Button variant={index === selected ? "default" : "outline"}
              aria-label={`${item.name} ${index === selected ? 'を選択中' : 'を選択'}`} aria-pressed={index === selected} onClick={() => restart(index)}>{index === selected ? '選択中' : '選択'}</Button>
          </TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
    </section>
    </div>
  </PageContainer></Page>
}
