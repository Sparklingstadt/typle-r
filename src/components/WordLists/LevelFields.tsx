"use client"
import { useId } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import FieldError from "@/components/WordLists/FieldError"
import { MAX_LEVEL } from "@/core/wordLists"

// The level of a list, such as 初級: one optional input, as a list has one level at most. An empty level is dropped
// when the list is saved. `error`, a save refused for the level, is shown under it and announced when it appears, and
// again for each refused save (each change of `refusals`).
export default function LevelFields({ value, onChange, error, refusals = 0 }: { value: string[]; onChange: (value: string[]) => void; error?: string; refusals?: number }) {
  const t = useTranslations("wordLists.editor")
  const id = useId()
  return <div className="space-y-2 pt-2">
    <Label htmlFor={id}>{t("levels")}</Label>
    <Input id={id} value={value[0] ?? ""} maxLength={MAX_LEVEL} placeholder={t("levelPlaceholder")}
      aria-invalid={error ? true : undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
      className="h-10" onChange={event => onChange(event.target.value ? [event.target.value] : [])} />
    {error && <FieldError key={refusals} id={`${id}-error`} message={error} alert />}
    <p id={`${id}-help`} className="text-xs text-muted-foreground">{t("levelsHelp")}</p>
  </div>
}
