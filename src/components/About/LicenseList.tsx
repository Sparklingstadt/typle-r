"use client"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ExternalLink } from "lucide-react"
import { SearchField } from "@/components/ui/search-field"

type Entry = { name: string; version: string; license: string; url: string; hasText: boolean }

// The list on /about/licenses, read from public/licenses/third-party.json (scripts/generate-licenses.cjs), with a filter
// by name or license.
export default function LicenseList() {
  const t = useTranslations("about.licenses")
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState("")

  useEffect(() => {
    let current = true
    fetch("/licenses/third-party.json")
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<Entry[]>
      })
      .then(list => { if (current) setEntries(list) }, () => { if (current) setFailed(true) })
    return () => { current = false }
  }, [])

  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return query ? (entries ?? []).filter(entry => `${entry.name} ${entry.license}`.toLowerCase().includes(query)) : entries ?? []
  }, [entries, filter])

  if (failed) return <p role="alert" className="text-sm text-destructive">{t("failed")}</p>
  if (!entries) return <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p>

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SearchField value={filter} onChange={setFilter} placeholder={t("filter")} ariaLabel={t("filter")} className="h-9 w-full sm:w-72" />
      <p className="text-sm text-muted-foreground" aria-live="polite">{t("count", { shown: shown.length, total: entries.length })}</p>
    </div>
    <ul className="divide-y rounded-xl border bg-card text-sm">
      {shown.map(entry => <li key={`${entry.name}@${entry.version}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5">
        <span className="min-w-0 break-all">
          {entry.url
            ? <a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-3 hover:underline">
              {entry.name}<span className="sr-only">{t("newTab")}</span><ExternalLink aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
            </a>
            : <span className="font-medium">{entry.name}</span>}
          {entry.version && <span className="ml-1.5 text-muted-foreground tabular-nums">{entry.version}</span>}
        </span>
        <span className="text-muted-foreground">{entry.license}{!entry.hasText && ` ${t("noText")}`}</span>
      </li>)}
    </ul>
  </div>
}
