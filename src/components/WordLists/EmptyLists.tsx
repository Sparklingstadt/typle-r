"use client"
import type { ReactNode } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Library as LibraryIcon, ListPlus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

export default function EmptyLists({ actions }: { actions?: ReactNode }) {
  const t = useTranslations('wordLists')
  return <EmptyState className="py-10 sm:py-14">
    <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><ListPlus className="size-6" aria-hidden="true" /></span>
    <div className="space-y-1.5">
      <h2 id="empty-heading" tabIndex={-1} className="font-bold outline-none">{t('empty.packTitle')}</h2>
      <p className="max-w-md text-sm text-balance text-muted-foreground">{t('empty.packDescription')}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-2">
      <Button asChild><Link href="/packs/catalog"><LibraryIcon aria-hidden="true" />{t('empty.catalogLink')}</Link></Button>
      <Button asChild variant="outline"><Link href="/create"><Plus aria-hidden="true" />{t('manager.createList')}</Link></Button>
      {actions}
    </div>
  </EmptyState>
}
