"use client"
import { useRouter } from "next/navigation"
import WordListEditor from "@/components/WordListEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import { GUEST_ACCOUNT_ID } from "@/lib/guestWorkspace"
import { useWordLists } from "@/lib/useWordLists"
import { saveList } from "@/lib/wordLists"

export default function Create() {
  const router = useRouter()
  const notify = useSaveNotification()
  const { ready, error, update, accountId } = useWordLists()
  return <WordListEditorPage>
    {ready ? <WordListEditor title="単語リストを作成" storage={accountId === GUEST_ACCOUNT_ID ? "browser" : "account"} error={error}
      onCancel={() => router.push('/edit')} onSave={async list => {
        const saved = await update(current => saveList(current, list, false))
        if (saved) { notify(`「${list.name}」を作成しました。`); router.push('/edit') }
        return saved
      }} /> : <p>読み込み中…</p>}
  </WordListEditorPage>
}
