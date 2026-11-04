"use client"
import { useId } from "react"
import { useTranslations } from "next-intl"
import { SearchField } from "@/components/ui/search-field"
import { packListChoices } from "@/core/packEditing"
import type { SavedWordList } from "@/core/wordLists"
import type { WordPack } from "@/core/wordPacks"

// The lists a new pack is made of, chosen with check boxes. A list's pack is named when the pack holds other lists too,
// since choosing the list takes it out of that pack.
export default function PackListChoices({ lists, packs, chosen, onChange, query, onQuery, disabled }: {
  lists: SavedWordList[]
  packs: WordPack[]
  chosen: string[]
  onChange: (ids: string[]) => void
  query: string
  onQuery: (query: string) => void
  disabled: boolean
}) {
  const t = useTranslations("wordLists.packEditor")
  const id = useId()
  const shown = packListChoices(lists, packs, query)
  return <section aria-labelledby={`${id}-heading`} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={`${id}-heading`} className="text-base font-bold">{t("choose")}</h2>
        <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">{t("chosen", { count: chosen.length })}</span>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">{t("chooseHelp")}</p>
    </div>
    <SearchField value={query} onChange={onQuery} placeholder={t("chooseFilter")} ariaLabel={t("chooseFilter")} className="h-10" />
    {shown.length ? <ul aria-labelledby={`${id}-heading`} aria-describedby={`${id}-help`} className="grid max-h-[28rem] gap-1 overflow-y-auto overscroll-contain">
      {shown.map(({ list, inPack }) => {
        const checked = chosen.includes(list.id)
        return <li key={list.id}>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:checked]:bg-muted">
            {/* Named by the list alone; its pack, levels and words describe it. */}
            <input type="checkbox" checked={checked} disabled={disabled} aria-labelledby={`${id}-${list.id}`} aria-describedby={`${id}-${list.id}-about`}
              className="size-4 shrink-0 accent-primary outline-none"
              onChange={event => onChange(event.target.checked ? [...chosen, list.id] : chosen.filter(item => item !== list.id))} />
            <span className="grid min-w-0">
              <span id={`${id}-${list.id}`} className="text-sm font-medium [overflow-wrap:anywhere]">{list.name}</span>
              <span id={`${id}-${list.id}-about`} className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {[inPack && t("inPack", { name: inPack }), list.levels?.length ? t("levels", { levels: list.levels.join("・") }) : null, t("wordCount", { count: list.words.length })].filter(Boolean).join(" · ")}
              </span>
            </span>
          </label>
        </li>
      })}
    </ul> : <p className="px-1 py-2 text-sm text-muted-foreground">{t("noMatch")}</p>}
  </section>
}
