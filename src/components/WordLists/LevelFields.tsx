"use client"
import { useId, useRef } from "react"
import { useTranslations } from "next-intl"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MAX_LEVEL, MAX_LEVELS } from "@/core/wordLists"

// The levels of a list, one input per step, such as 基本 then 初級. Empty steps are dropped when the list is saved.
export default function LevelFields({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const t = useTranslations("wordLists.editor")
  const id = useId()
  const group = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)

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
      {value.map((level, index) => <li key={index} className="flex items-center gap-2">
        <span aria-hidden="true" className="w-5 shrink-0 text-center text-sm text-muted-foreground tabular-nums">{index + 1}</span>
        <Input data-level value={level} maxLength={MAX_LEVEL} aria-label={t("levelLabel", { n: index + 1 })} aria-describedby={`${id}-help`} placeholder={t("levelPlaceholder")}
          className="h-10" onChange={event => onChange(value.map((item, position) => position === index ? event.target.value : item))} />
        <Button type="button" variant="ghost" size="icon" aria-label={t("removeLevel", { n: index + 1 })} title={t("removeLevel", { n: index + 1 })}
          onClick={() => remove(index)}><X aria-hidden="true" /></Button>
      </li>)}
    </ol>}
    <Button ref={addButton} type="button" variant="outline" size="sm" disabled={value.length >= MAX_LEVELS} onClick={() => onChange([...value, ""])}>
      <Plus aria-hidden="true" />{t("addLevel")}
    </Button>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">{t("levelsHelp", { max: MAX_LEVELS })}</p>
  </div>
}
