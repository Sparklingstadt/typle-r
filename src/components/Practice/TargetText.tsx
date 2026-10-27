import { cn } from '@/lib/utils'
import type { CharacterState } from '@/core/typing'
import PracticeText from './PracticeText'

const caret = 'relative after:absolute after:inset-x-0 after:-bottom-[0.08em] after:h-[max(3px,0.06em)] after:rounded-full motion-safe:after:animate-pulse'
const stateClass: Record<CharacterState, string> = {
  done: 'text-green-700 dark:text-green-400',
  current: cn(caret, 'after:bg-foreground'),
  error: 'rounded-sm bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  'current-error': cn(caret, 'text-neutral-400 after:bg-destructive dark:text-neutral-500'),
  pending: 'text-neutral-400 dark:text-neutral-500',
}

// Characters are inline spans with pre-wrap, so spaces stay visible and long text wraps instead of overflowing.
export default function TargetText({ id, characters, states, extra, guide = false, className }: {
  id?: string
  characters: string[]
  states: CharacterState[]
  extra: string[]
  guide?: boolean
  className?: string
}) {
  const current = states.findIndex(state => state === 'current' || state === 'current-error')
  const activeIndex = current >= 0 ? current : characters.length + extra.length - 1
  return <PracticeText id={id} text={characters.join('')} activeIndex={activeIndex} guide={guide} className={className}>
    {characters.map((char, index) => <span key={index} data-state={states[index]} className={stateClass[states[index]]}>{char}</span>)}
    {extra.map((char, index) => <span key={`extra-${index}`} data-state="extra" className="rounded-sm bg-red-100 text-red-700 line-through dark:bg-red-950 dark:text-red-400">{char}</span>)}
  </PracticeText>
}
