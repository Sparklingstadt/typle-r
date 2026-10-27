"use client"

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Long passages keep a readable size. Only this area scrolls, keeping the input close to the current line.
export default function PracticeText({ id, text, activeIndex, children, guide = false, className }: {
  id?: string
  text: string
  activeIndex?: number
  children?: ReactNode
  guide?: boolean
  className?: string
}) {
  const paragraph = useRef<HTMLParagraphElement>(null)
  const length = Array.from(text).length
  const multiline = length > 24 || text.includes('\n')

  useLayoutEffect(() => {
    const element = paragraph.current
    if (!element) return
    if (activeIndex === undefined || activeIndex === 0) element.scrollTop = 0
    function followCharacter() {
      if (!element || activeIndex === undefined) return
      const character = element.children.item(activeIndex)
      if (!character) return
      const bounds = element.getBoundingClientRect()
      const current = character.getBoundingClientRect()
      // Leave room for the caret and some context without scrolling the surrounding page.
      const margin = parseFloat(getComputedStyle(element).lineHeight) / 3
      if (current.top < bounds.top + margin) element.scrollTop -= bounds.top + margin - current.top
      else if (current.bottom > bounds.top + element.clientHeight - margin) {
        element.scrollTop += current.bottom - bounds.top - element.clientHeight + margin
      }
    }
    followCharacter()
    const observer = new ResizeObserver(followCharacter)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, activeIndex])

  return <p ref={paragraph} id={id} className={cn(
    'm-0 max-h-[min(5lh,28dvh)] max-w-full overflow-y-auto overscroll-contain py-1 font-medium whitespace-pre-wrap [overflow-wrap:anywhere]',
    className ?? (multiline ? 'w-full text-left text-xl leading-[1.75] sm:text-[26px]'
      : guide ? 'text-2xl leading-relaxed tracking-wide sm:text-3xl'
        : length > 10 ? 'text-[32px] leading-tight sm:text-[44px]' : 'text-[44px] leading-tight sm:text-[64px]'),
  )}>{children ?? text}</p>
}
