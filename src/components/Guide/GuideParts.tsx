import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { compareInput } from '@/lib/typing'
import Kbd from '@/components/Practice/Kbd'
import TargetText from '@/components/Practice/TargetText'

export const guideLink = 'font-medium underline decoration-foreground/30 underline-offset-3 hover:decoration-foreground'

export function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={guideLink}>{children}</Link>
}

const chunkText = (chunks: ReactNode) => (Array.isArray(chunks) ? chunks : [chunks]).join('')

// Rich-text tags shared by the guide's messages: links to each screen, in-page links and key combinations ("Ctrl+Enter").
export const guideTags = {
  play: (chunks: ReactNode) => <PageLink href="/play">{chunks}</PageLink>,
  create: (chunks: ReactNode) => <PageLink href="/create">{chunks}</PageLink>,
  edit: (chunks: ReactNode) => <PageLink href="/edit">{chunks}</PageLink>,
  records: (chunks: ReactNode) => <PageLink href="/records">{chunks}</PageLink>,
  rankings: (chunks: ReactNode) => <PageLink href="/rankings">{chunks}</PageLink>,
  home: (chunks: ReactNode) => <PageLink href="/home">{chunks}</PageLink>,
  devices: (chunks: ReactNode) => <PageLink href="/devices">{chunks}</PageLink>,
  devicesSection: (chunks: ReactNode) => <a href="#devices" className={guideLink}>{chunks}</a>,
  wordCount: (chunks: ReactNode) => <a href="#word-count" className={guideLink}>{chunks}</a>,
  keys: (chunks: ReactNode) => <Keys keys={chunkText(chunks).split('+')} />,
}

export function GuideSection({ id, icon: Icon, title, lead, children }: {
  id: string
  icon: LucideIcon
  title: string
  lead: ReactNode
  children: ReactNode
}) {
  return <section id={id} aria-labelledby={`${id}-heading`} className="border-t pt-8">
    <h2 id={`${id}-heading`} className="flex items-center gap-2.5 text-xl font-bold">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4.5" aria-hidden="true" /></span>
      {title}
    </h2>
    <p className="mt-3 text-muted-foreground">{lead}</p>
    <div className="mt-5 space-y-5">{children}</div>
  </section>
}

export function Topic({ title, children }: { title: string; children: ReactNode }) {
  return <div>
    <h3 className="mb-2 text-base font-bold">{title}</h3>
    {children}
  </div>
}

export function Points({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground/60">{children}</ul>
}

export function Keys({ keys }: { keys: string[] }) {
  return <span className="inline-flex flex-wrap items-center gap-1">
    {keys.map((key, index) => <span key={index} className="inline-flex items-center gap-1">
      {index > 0 && <span className="text-xs text-muted-foreground" aria-hidden="true">+</span>}
      <Kbd className="h-6 px-2 text-xs text-foreground/80">{key}</Kbd>
    </span>)}
  </span>
}

const legend: { sample: string; typed: string; items: ('done' | 'current' | 'pending' | 'error')[] }[] = [
  { sample: 'typle', typed: 'ty', items: ['done', 'current', 'pending'] },
  { sample: 'typle', typed: 'tyo', items: ['error'] },
]

const swatch: Record<'done' | 'current' | 'pending' | 'error', string> = {
  done: 'text-green-700 dark:text-green-400',
  current: 'underline decoration-foreground decoration-2 underline-offset-4',
  pending: 'text-neutral-400 dark:text-neutral-500',
  error: 'rounded-sm bg-red-100 px-0.5 text-red-700 dark:bg-red-950 dark:text-red-400',
}

// Renders the practice screen's own character states, so the colors here always match what the player sees.
export function ColorLegend() {
  const t = useTranslations('guide.legend')
  return <div className="grid gap-3 sm:grid-cols-2">
    {legend.map(({ sample, typed, items }) => {
      const { characters, states, extra } = compareInput(sample, typed)
      return <figure key={typed} className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <TargetText characters={characters} states={states} extra={extra} className="text-3xl leading-tight tracking-wide" />
          <span className="shrink-0 text-xs text-muted-foreground">{t.rich('typed', { typed, mono: chunks => <span className="font-mono">{chunks}</span> })}</span>
        </div>
        <figcaption>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {items.map(state => <li key={state} className="inline-flex items-center gap-1.5">
              <span className={cn('font-medium', swatch[state])} aria-hidden="true">{t('swatch')}</span>
              {t(`${state}.label`)}<span className="text-muted-foreground">{t(`${state}.note`)}</span>
            </li>)}
          </ul>
        </figcaption>
      </figure>
    })}
  </div>
}
