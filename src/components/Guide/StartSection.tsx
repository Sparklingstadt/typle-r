import Link from "next/link"
import { ArrowRight, Library, Plus, Trophy, type LucideIcon } from "lucide-react"
import { useGuideText } from "@/components/Guide/GuideParts"

const steps: { icon: LucideIcon; key: "follow" | "create" | "review"; href: string }[] = [
  { icon: Library, key: "follow", href: "/packs/catalog" },
  { icon: Plus, key: "create", href: "/packs/create" },
  { icon: Trophy, key: "review", href: "/rankings" },
]

export default function StartSection() {
  const { t } = useGuideText()
  return <section aria-labelledby="start-heading">
    <h2 id="start-heading" className="mb-3 text-base font-bold">{t("start.title")}</h2>
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map(({ icon: Icon, key, href }, index) => <li key={href} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">{index + 1}</span>
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-[15px] font-bold leading-6">{t(`start.${key}.title`)}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{t(`start.${key}.text`)}</p>
        <Link href={href} className="mt-auto inline-flex w-fit items-center gap-1 rounded-sm pt-1 text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{t(`start.${key}.action`)}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
      </li>)}
    </ol>
  </section>
}
