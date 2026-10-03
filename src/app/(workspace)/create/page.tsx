"use client"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import WordListEditor from "@/components/WordListEditor"
import WordListEditorPage from "@/components/WordListEditorPage/WordListEditorPage"
import { useSaveNotification } from "@/components/SaveNotification"
import { GUEST_ACCOUNT_ID } from "@/lib/guestWorkspace"
import { useWordLists } from "@/lib/useWordLists"
import { saveList } from "@/lib/wordLists"

export default function Create() {
  const router = useRouter()
  const notify = useSaveNotification()
  const t = useTranslations('wordLists')
  const { ready, error, errorKey, update, accountId } = useWordLists()
  return <WordListEditorPage>
    {ready ? <WordListEditor title={t('page.createTitle')} storage={accountId === GUEST_ACCOUNT_ID ? "browser" : "account"} error={error} errorKey={errorKey}
      onCancel={() => router.push('/edit')} onSave={async list => {
        const saved = await update(current => saveList(current, list, false))
        if (saved) { notify(t('page.created', { name: list.name })); router.push('/edit') }
        return saved
      }} /> : <p>{t('loading')}</p>}
  </WordListEditorPage>
}
