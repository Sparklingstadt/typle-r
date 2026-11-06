import { Command } from "lucide-react"
import { GuideSection, Keys, useGuideText } from "@/components/Guide/GuideParts"

const shortcuts: { screen: "practice" | "complete" | "editor"; rows: { keys: string[][]; action: "restart" | "resume" | "again" | "next" | "move" | "save" }[] }[] = [
  { screen: "practice", rows: [
    { keys: [["Esc"]], action: "restart" },
    { keys: [["anyKey"]], action: "resume" },
  ] },
  { screen: "complete", rows: [{ keys: [["Enter"]], action: "again" }] },
  { screen: "editor", rows: [
    { keys: [["Enter"]], action: "next" },
    { keys: [["Alt", "↑"], ["↓"]], action: "move" },
    { keys: [["Ctrl", "Enter"]], action: "save" },
  ] },
]

export default function ShortcutsSection() {
  const { t } = useGuideText()
  return <GuideSection id="shortcuts" icon={Command} title={t("contents.shortcuts")} lead={t("shortcuts.lead")}>
    <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
      {shortcuts.map(group => <div key={group.screen}>
        <h3 className="bg-muted/50 px-4 py-2 text-xs font-bold text-muted-foreground">{t(`shortcuts.screens.${group.screen}`)}</h3>
        <dl className="divide-y">
          {group.rows.map(row => <div key={row.action} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="flex flex-wrap items-center gap-x-2 gap-y-1">{row.keys.map((keys, index) => <span key={index} className="inline-flex items-center gap-2">{index > 0 && <span className="text-xs text-muted-foreground">/</span>}<Keys keys={keys.map(key => key === "anyKey" ? t("shortcuts.anyKey") : key)} /></span>)}</dt>
            <dd>{t(`shortcuts.actions.${row.action}`)}</dd>
          </div>)}
        </dl>
      </div>)}
    </div>
  </GuideSection>
}
