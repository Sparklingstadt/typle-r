"use client"
import { useId, useRef } from "react"
import { useTranslations } from "next-intl"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import FieldError from "@/components/WordLists/FieldError"
import { MAX_LEVEL, MAX_LEVELS } from "@/core/wordLists"

// The levels of a list, one input per step, such as 基本 then 初級. Empty steps are dropped when the list is saved.
// A level that repeats an earlier one is marked while typing, as the save refuses it (levelDuplicate). `errorId` is the
// message the save showed for it under the levels, which then takes the place of the message under each input.
export default function LevelFields({ value, onChange, errorId }: { value: string[]; onChange: (value: string[]) => void; errorId?: string }) {
  const t = useTranslations("wordLists.editor")
  const errors = useTranslations("errors")
  const id = useId()
  const group = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)

  // Levels are compared as the save compares them: trimmed, and empty ones left out.
  const duplicate = (index: number) => {
    const level = value[index].trim()
    return !!level && value.slice(0, index).some(other => other.trim() === level)
  }

  // After a level is removed, focus moves to the level that took its place, the one before it, or the add button.
  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index))
    const target = index < value.length - 1 ? index : index - 1
    requestAnimationFrame(() => {
      const inputs = group.current?.querySelectorAll<HTMLInputElement>("input[data-level]")
      const input = target >= 0 ? inputs?.[target] : undefined
      if (input) input.focus()
      else addButton.current?.focus()
    })
  }
  return <div ref={group} role="group" aria-labelledby={`${id}-label`} className="space-y-2 pt-2">
    <Label id={`${id}-label`}>{t("levels")}</Label>
    {value.length > 0 && <ol className="space-y-2">
      {value.map((level, index) => {
        const repeated = duplicate(index)
        const ownError = repeated && !errorId ? `${id}-error-${index}` : undefined
        return <li key={index} className="space-y-1">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="w-5 shrink-0 text-center text-sm text-muted-foreground tabular-nums">{index + 1}</span>
            <Input data-level value={level} maxLength={MAX_LEVEL} aria-label={t("levelLabel", { n: index + 1 })} placeholder={t("levelPlaceholder")}
              aria-invalid={repeated || undefined} aria-describedby={`${id}-help${repeated ? ` ${ownError ?? errorId}` : ""}`}
              className="h-10" onChange={event => onChange(value.map((item, position) => position === index ? event.target.value : item))} />
            <Button type="button" variant="ghost" size="icon" aria-label={t("removeLevel", { n: index + 1 })} title={t("removeLevel", { n: index + 1 })}
              onClick={() => remove(index)}><X aria-hidden="true" /></Button>
          </div>
          {/* Shown when the level becomes a repeat, and announced once then, not on each key while it stays one. */}
          {ownError && <div className="pl-7"><FieldError id={ownError} message={errors("levelDuplicate")} alert /></div>}
        </li>
      })}
    </ol>}
    <Button ref={addButton} type="button" variant="outline" size="sm" disabled={value.length >= MAX_LEVELS} onClick={() => onChange([...value, ""])}>
      <Plus aria-hidden="true" />{t("addLevel")}
    </Button>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">{t("levelsHelp", { max: MAX_LEVELS })}</p>
  </div>
}
