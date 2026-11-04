"use client"
import { useLocale, useTranslations } from "next-intl"
import { Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import LevelFields from "@/components/WordLists/LevelFields"
import FieldError from "@/components/WordLists/FieldError"
import { WRITING_LANGUAGES, type WritingLanguage } from "@/core/wordLists"
import type { WordPack } from "@/core/wordPacks"
import { WRITING_DEFAULTS } from "@/core/wordDraft"

export default function WordListBasics({ baseId, hasPackFields, choosePack, packs, chosenPack, setChosenPack, leavingLonePack, lonePackName, name, setName, nameError, nameAlert, levels, setLevels, levelError, error, refusals, writing, setWriting }: {
  baseId: string
  hasPackFields: boolean
  choosePack: boolean
  packs: WordPack[]
  chosenPack: string | null
  setChosenPack: (packId: string | null) => void
  leavingLonePack: boolean
  lonePackName: string | undefined
  name: string
  setName: (name: string) => void
  nameError: string | undefined
  /** Whether the name's error is announced as an alert: the duplicate-name error from the server. */
  nameAlert: boolean
  levels: string[]
  setLevels: (levels: string[]) => void
  levelError: boolean
  error: string | undefined
  /** Counts refused saves, so the level field can react to each one. */
  refusals: number
  writing: WritingLanguage | null
  setWriting: (writing: WritingLanguage | null) => void
}) {
  const t = useTranslations("wordLists.editor")
  const locale = useLocale()
  const nameId = `${baseId}-name`
  const packSelectId = `${baseId}-pack`
  const writingId = `${baseId}-writing`
  const writingLanguageId = `${baseId}-writing-language`
  return <section className="space-y-2 rounded-xl border bg-card p-4 sm:p-6" aria-label={t("basics")}>
    {!hasPackFields && !choosePack && chosenPack && <p className="pb-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
      {t("addingTo", { name: packs.find(pack => pack.id === chosenPack)?.name ?? "" })}
    </p>}
    {!hasPackFields && choosePack && <>
      <Label htmlFor={packSelectId}>{t("pack")}</Label>
      <select id={packSelectId} value={chosenPack ?? ""} aria-describedby={`${leavingLonePack ? `${packSelectId}-deleted ` : ""}${packSelectId}-help`} onChange={event => setChosenPack(event.target.value || null)}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover">
        {packs.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
        <option value="">{t("newPack")}</option>
      </select>
      {leavingLonePack && <p id={`${packSelectId}-deleted`} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span className="[overflow-wrap:anywhere]">{t("packWillBeDeleted", { name: lonePackName ?? "" })}</span>
      </p>}
      <p id={`${packSelectId}-help`} className="pb-2 text-xs text-muted-foreground">{t("packHelp")}</p>
    </>}
    <Label htmlFor={nameId}>{t("name")}<span aria-hidden="true" className="text-destructive">*</span></Label>
    <Input id={nameId} value={name} onChange={event => setName(event.target.value)} required aria-required="true"
      aria-invalid={nameError ? true : undefined} aria-describedby={`${nameId}-help${nameError ? ` ${nameId}-error` : ""}`} className="h-11" />
    {nameError ? <FieldError id={`${nameId}-error`} message={nameError} alert={nameAlert} />
      : null}
    <p id={`${nameId}-help`} className="text-xs text-muted-foreground">{t("nameHelp")}</p>
    <LevelFields value={levels} onChange={setLevels} error={levelError ? error ?? "" : undefined} refusals={refusals} />
    <div className="flex items-center gap-3 pt-2">
      <Switch id={writingId} checked={writing !== null} aria-describedby={`${writingId}-help`}
        onCheckedChange={on => setWriting(on ? WRITING_DEFAULTS[locale] ?? "en" : null)} />
      <Label htmlFor={writingId}>{t("writingToggle")}</Label>
    </div>
    <p id={`${writingId}-help`} className="text-xs text-muted-foreground">{t("writingToggleHelp")}</p>
    {writing && <>
      <Label htmlFor={writingLanguageId}>{t("writingLanguage")}</Label>
      <select id={writingLanguageId} value={writing} onChange={event => setWriting(event.target.value as WritingLanguage)}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover">
        {WRITING_LANGUAGES.map(code => <option key={code} value={code}>{t(`writingLanguages.${code}`)}</option>)}
      </select>
    </>}
  </section>
}
