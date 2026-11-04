"use client"
import { useTranslations } from "next-intl"
import { CircleAlert, Info } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function WordListSaveBar({ recount, errorCount, onFirstError, serverError, dirty, wordCount, saving, onCancel }: {
  recount: { from: number; to: number; records: number } | null
  errorCount: number
  onFirstError: () => void
  serverError: string | undefined
  dirty: boolean
  wordCount: number
  saving: boolean
  onCancel: () => void
}) {
  const t = useTranslations("wordLists.editor")
  const form = useTranslations("common.form")
  return <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.05)] backdrop-blur sm:bottom-4 sm:mx-0 sm:mb-4 sm:rounded-xl sm:border sm:px-5 sm:shadow-lg">
    {recount && <p className="mb-2.5 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{t("recount", { from: recount.from, to: recount.to, records: recount.records })}</span>
    </p>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:flex-1 sm:basis-auto">
        {errorCount ? <>
          <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <span role="alert" className="font-medium text-destructive">{t("errorCount", { count: errorCount })}</span>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onFirstError}>{t("firstError")}</Button>
        </> : serverError ? <p role="alert" className="flex items-start gap-1.5 text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{serverError}
        </p> : dirty ? <>
          <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
          <span className="font-medium">{t("unsaved")}</span>
        </> : <span className="text-muted-foreground">{t("noChanges")}</span>}
        <span className={errorCount || serverError ? "text-muted-foreground max-sm:hidden" : "text-muted-foreground"}>{t("wordTotal", { count: wordCount })}</span>
      </div>
      <Button variant="ghost" onClick={onCancel}>{form("cancel")}</Button>
      <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
        {saving ? form("saving") : t("save")}<span aria-hidden="true" className="hidden text-xs font-normal opacity-60 sm:inline">Ctrl+Enter</span>
      </Button>
    </div>
  </div>
}
