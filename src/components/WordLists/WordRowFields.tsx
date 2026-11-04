"use client"
import { useTranslations } from "next-intl"
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, MoreHorizontal, Trash2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import SortableWordRow from "@/components/SortableWordRow"
import FieldError from "@/components/WordLists/FieldError"
import type { InputType } from "@/core/wordLists"
import type { DraftWord, Word } from "@/core/wordDraft"

export default function WordRowFields({ word, index, count, baseId, displayId, inputId, saving, displayError, inputError, onChange, onMove, onRemove }: {
  word: DraftWord
  index: number
  count: number
  baseId: string
  displayId: string
  inputId: string
  saving: boolean
  displayError: string | undefined
  inputError: string | undefined
  onChange: (change: Partial<Word>) => void
  onMove: (target: number) => void
  onRemove: () => void
}) {
  const t = useTranslations("wordLists.editor")
  const n = index + 1
  const rowError = displayError ?? inputError
  return <SortableWordRow id={word.key} index={index} disabled={saving || count < 2} invalid={!!rowError}>
    <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
      <Input id={displayId} data-word-key={word.key} aria-label={t("displayLabel", { n })} placeholder={t("displayPlaceholder")} value={word.display}
        required aria-required="true" aria-invalid={displayError ? true : undefined} aria-describedby={rowError ? `${displayId}-error` : undefined}
        className="h-10" onChange={event => onChange({ display: event.target.value })} />
    </div>
    <div className="col-span-3 row-start-3 grid grid-cols-2 gap-2 md:contents">
      <div className="space-y-1 md:col-start-3 md:row-start-1 md:space-y-0">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground md:sr-only">{t("input")}</Label>
        <Input id={inputId} data-word-key={word.key} aria-label={t("inputLabel", { n })} placeholder={word.display} value={word.input}
          aria-invalid={inputError ? true : undefined} aria-describedby={inputError ? `${displayId}-error` : undefined}
          className="h-10" onChange={event => onChange({ input: event.target.value })} />
      </div>
      <div className="space-y-1 md:col-start-4 md:row-start-1 md:space-y-0">
        <Label htmlFor={`${baseId}-input-type-${word.key}`} className="text-xs text-muted-foreground md:sr-only">{t("inputType")}</Label>
        <select id={`${baseId}-input-type-${word.key}`} aria-label={t("inputTypeLabel", { n })} value={word.input_type ?? "word"}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          disabled={saving} onChange={event => onChange({ input_type: event.target.value as InputType })}>
          <option value="word">{t("inputTypeWord")}</option>
          <option value="command">{t("inputTypeCommand")}</option>
          <option value="code">{t("inputTypeCode")}</option>
        </select>
      </div>
      <div className="col-span-2 space-y-1 md:col-span-1 md:col-start-5 md:row-start-1 md:space-y-0">
        <Label htmlFor={`${baseId}-annotation-${word.key}`} className="text-xs text-muted-foreground md:sr-only">{t("annotation")}</Label>
        <Input id={`${baseId}-annotation-${word.key}`} data-word-key={word.key} aria-label={t("annotationLabel", { n })} placeholder={t("annotationPlaceholder")} value={word.annotation}
          className="h-10" onChange={event => onChange({ annotation: event.target.value })} />
      </div>
    </div>
    <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 md:col-start-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("wordActions", { n })} title={t("actions")}><MoreHorizontal aria-hidden="true" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="min-w-52">
          <DropdownMenuItem disabled={index === 0} aria-keyshortcuts="Alt+ArrowUp" onSelect={() => onMove(index - 1)}>
            <ArrowUp aria-hidden="true" />{t("moveUp")}<span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">Alt+↑</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} aria-keyshortcuts="Alt+ArrowDown" onSelect={() => onMove(index + 1)}>
            <ArrowDown aria-hidden="true" />{t("moveDown")}<span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">Alt+↓</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(0)}>
            <ArrowUpToLine aria-hidden="true" />{t("moveFirst")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(count - 1)}>
            <ArrowDownToLine aria-hidden="true" />{t("moveLast")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={count < 2} onSelect={() => onRemove()}>
            <Trash2 aria-hidden="true" />{t("deleteWord")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="hidden md:inline-flex">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" disabled={count < 2}
          onClick={() => onRemove()} aria-label={t("deleteWordN", { n })} title={t("delete")}><Trash2 aria-hidden="true" /></Button>
      </span>
    </div>
    {rowError && <div className="col-span-3 row-start-4 md:col-span-4 md:col-start-2 md:row-start-2">
      <FieldError id={`${displayId}-error`} message={rowError} />
    </div>}
  </SortableWordRow>
}
