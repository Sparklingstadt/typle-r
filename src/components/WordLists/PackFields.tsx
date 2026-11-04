"use client"
import { useId } from "react"
import { useTranslations } from "next-intl"
import { CircleAlert } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import LabelFields from "@/components/WordLists/LabelFields"
import type { Labels } from "@/core/listOverview"
import type { PackInput } from "@/core/packEditing"
import { MAX_PACK_DESCRIPTION, MAX_PACK_NAME } from "@/core/wordPacks"

/** The `name` of the pack name field, for finding it to focus. */
export const PACK_NAME_FIELD = "pack-name"

/** True when the two inputs would save the same pack. */
export const samePackInput = (a: PackInput, b: PackInput) =>
  JSON.stringify([a.name, a.description ?? "", a.category ?? "", a.tags ?? []]) === JSON.stringify([b.name, b.description ?? "", b.category ?? "", b.tags ?? []])

// The fields of a pack: name, description, category and tags. The name's error is passed in because it is found on saving.
export default function PackFields({ value, onChange, suggestions, nameError }: {
  value: PackInput
  onChange: (value: PackInput) => void
  suggestions: Labels
  nameError?: string
}) {
  const t = useTranslations("wordLists.packEditor")
  const id = useId()
  const nameId = `${id}-name`
  const descriptionId = `${id}-description`
  return <section className="space-y-2 rounded-xl border bg-card p-4 sm:p-6" aria-label={t("info")}>
    <Label htmlFor={nameId}>{t("name")}<span aria-hidden="true" className="text-destructive">*</span></Label>
    <Input id={nameId} name={PACK_NAME_FIELD} value={value.name} maxLength={MAX_PACK_NAME} required aria-required="true"
      onChange={event => onChange({ ...value, name: event.target.value })}
      aria-invalid={nameError ? true : undefined} aria-describedby={`${nameId}-help${nameError ? ` ${nameId}-error` : ""}`} className="h-11" />
    {nameError ? <p id={`${nameId}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{nameError}
    </p> : null}
    <p id={`${nameId}-help`} className="text-xs text-muted-foreground">{t("nameHelp")}</p>
    <Label htmlFor={descriptionId} className="pt-2">{t("descriptionLabel")}</Label>
    <Textarea id={descriptionId} value={value.description ?? ""} maxLength={MAX_PACK_DESCRIPTION} placeholder={t("descriptionPlaceholder")}
      onChange={event => onChange({ ...value, description: event.target.value })} />
    <LabelFields category={value.category ?? ""} tags={value.tags ?? []} suggestions={suggestions}
      onCategoryChange={category => onChange({ ...value, category })} onTagsChange={tags => onChange({ ...value, tags })} />
  </section>
}
