"use client"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Clock, Sparkles, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { T } from "@/components/Dashboard/Delta"
import PracticeName, { usePracticeName } from "@/components/PracticeName"
import { useFormat } from "@/i18n/useFormat"
import type { NextList } from "@/core/dashboard"
import type { SavedWordList } from "@/core/wordLists"

export function practiceHref(list: SavedWordList) { return `/play?list=${encodeURIComponent(list.id)}` }

function reasonBadge(t: T, { reason }: NextList) {
  if (reason.kind === 'new') return { icon: Sparkles, text: t('next.new') }
  if (reason.kind === 'stale') return { icon: Clock, text: t('next.stale', { days: reason.days }) }
  return { icon: Target, text: t('next.lowAccuracy', { count: reason.count, accuracy: reason.accuracy.toFixed(1) }) }
}

export default function NextLists({ items, now }: { items: NextList[]; now: Date }) {
  const t = useTranslations('dashboard')
  const practiceName = usePracticeName()
  const format = useFormat()
  if (!items.length) return <p className="rounded-xl p-4 text-sm ring-1 ring-foreground/10">{t('next.allPractised')}</p>
  return <ul className="divide-y overflow-hidden rounded-xl ring-1 ring-foreground/10">
    {items.map(item => {
      const { icon: Icon, text } = reasonBadge(t, item)
      return <li key={item.list.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 p-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <p className="font-medium break-words"><PracticeName list={item.list} /></p>
          <p className="text-[13px] text-muted-foreground">{t('next.words', { count: item.list.words.length })} · {item.lastPracticed ? t('next.lastPracticed', { day: format.day(item.lastPracticed, now) }) : t('next.noRecords')}</p>
        </div>
        <Badge variant="outline" className="col-span-2 justify-self-start md:col-span-1"><Icon aria-hidden="true" />{text}</Badge>
        <Button asChild variant="outline" className="col-start-2 row-start-1 md:col-start-3">
          <Link href={practiceHref(item.list)} aria-label={t('next.practiceList', { name: practiceName(item.list) })}>{t('next.practice')}</Link>
        </Button>
      </li>
    })}
  </ul>
}
