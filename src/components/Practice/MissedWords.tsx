"use client"
import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { wordMeaning } from '@/core/landing'
import type { WordMistake } from '@/core/typing'
import type { SavedWordList } from '@/core/wordLists'

type Word = SavedWordList['words'][number]

// What to show for a key: a space or another blank key is named, as it would be invisible.
function keyLabel(key: string, space: string) {
  return /^\s$/u.test(key) ? space : key
}

// The text to type, with the character the first wrong key should have been marked.
function MarkedInput({ input, position }: { input: string; position?: number }) {
  const characters = Array.from(input)
  if (position === undefined || position >= characters.length) return <>{input}</>
  return <>{characters.slice(0, position).join('')}<mark className="rounded-[2px] bg-transparent text-red-700 underline decoration-[3px] underline-offset-4 dark:text-red-400">{characters[position]}</mark>{characters.slice(position + 1).join('')}</>
}

// The result screen's list of the words that went wrong in the run: the word, its meaning, how it first went wrong and
// how many times. A run without any says so in one line.
export default function MissedWords({ words, mistakes, writing }: { words: Word[]; mistakes: WordMistake[]; writing: boolean }) {
  const t = useTranslations('practice.result.missed')
  const headingId = useId()
  const rows = mistakes.flatMap(mistake => words[mistake.index] ? [{ mistake, word: words[mistake.index] }] : [])
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t('none')}</p>
  return <section aria-labelledby={headingId} className="flex flex-col">
    <h3 id={headingId} className="mb-2 text-base font-bold">{t('title')}</h3>
    <ul className="divide-y border-y">
      {rows.map(({ mistake, word }) => {
        const meaning = word.annotation ? wordMeaning(word.display, word.annotation) : ''
        const how = mistake.skipped ? t('skipped')
          : mistake.revealed ? t('revealed')
          : mistake.typed === undefined ? ''
          : writing ? t('wrote', { typed: mistake.typed })
          : t('typed', { position: (mistake.position ?? 0) + 1, typed: keyLabel(mistake.typed, t('space')) })
        return <li key={mistake.index} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto_3.5rem]">
          <p lang="und" className="min-w-0 font-mono text-lg break-words">
            {word.display !== word.input && <span className="mr-2 font-sans">{word.display}</span>}
            {writing ? word.display === word.input && word.input : <MarkedInput input={word.input} position={mistake.position} />}
          </p>
          <p className="min-w-0 text-sm break-words text-muted-foreground max-sm:col-span-2 max-sm:row-start-2">{meaning}</p>
          <p className="text-[13px] text-muted-foreground max-sm:col-start-1 max-sm:row-start-3">{how}</p>
          <p className="text-right text-sm font-bold text-red-700 tabular-nums max-sm:col-start-2 max-sm:row-start-1 dark:text-red-400">{mistake.count > 0 && t('count', { count: mistake.count })}</p>
        </li>
      })}
    </ul>
  </section>
}
