import { Cloud, HardDrive, TriangleAlert } from "lucide-react"
import { GuideSection, Points, useGuideText } from "@/components/Guide/GuideParts"

export default function StorageSection() {
  const { t, rich } = useGuideText()
  return <GuideSection id="storage" icon={HardDrive} title={t("contents.storage")} lead={t("storage.lead")}>
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        { icon: HardDrive, place: "browser" },
        { icon: Cloud, place: "account" },
      ] as const).map(({ icon: Icon, place }) => <div key={place} className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden="true" /></span>
          <div>
            <h3 className="text-[15px] font-bold leading-6">{t(`storage.${place}.title`)}</h3>
            <p className="text-xs text-muted-foreground">{t(`storage.${place}.when`)}</p>
          </div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-muted-foreground/60">{(["p1", "p2"] as const).map(point => <li key={point}>{t(`storage.${place}.${point}`)}</li>)}</ul>
      </div>)}
    </div>
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <TriangleAlert className="mt-1 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div>
        <h3 className="text-[15px] font-bold leading-6">{t("storage.warning.title")}</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-amber-600/60">
          <li>{t("storage.warning.p1")}</li>
          <li>{t("storage.warning.p2")}</li>
        </ul>
      </div>
    </div>
    <Points>
      <li>{t("storage.notes.p1")}</li>
      <li>{rich("storage.notes.p2")}</li>
      <li>{t("storage.notes.p3")}</li>
    </Points>
  </GuideSection>
}
