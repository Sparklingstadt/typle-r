"use client"
import { useId, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { listLabels } from '@/core/listOverview'
import { MAX_CATEGORY, MAX_TAG, MAX_TAGS, normalizeLabels } from '@/core/wordLists'

// A comma (or 、 and ，) ends a tag, so a pasted "Go, CLI" becomes two.
const separators = /[,、，]/

/** The tags with `text` added: the separated parts, trimmed, unless already there in any case, up to MAX_TAGS. */
export function addTags(tags: string[], text: string) {
  return (normalizeLabels({ tags: [...tags, ...text.split(separators)] }).tags ?? []).slice(0, MAX_TAGS)
}

// The category, picked from those in use or typed, and the tags, each added with Enter or a comma. A tag being typed is
// saved too (see WordListEditor), so nothing typed is lost by pressing 保存 straight away.
export default function LabelFields({ category, tags, draft, suggestions, onCategoryChange, onTagsChange, onDraftChange }: {
  category: string
  tags: string[]
  draft: string
  suggestions: ReturnType<typeof listLabels>
  onCategoryChange: (value: string) => void
  onTagsChange: (value: string[]) => void
  onDraftChange: (value: string) => void
}) {
  const t = useTranslations('wordLists.editor')
  const id = useId()
  const full = tags.length >= MAX_TAGS

  function changeDraft(value: string) {
    if (!separators.test(value)) return onDraftChange(value)
    const parts = value.split(separators)
    onTagsChange(addTags(tags, parts.slice(0, -1).join(',')))
    onDraftChange(parts.at(-1) ?? '')
  }

  // Enter adds the tag being typed instead of moving to the words; with nothing typed it does what it does elsewhere.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || event.keyCode === 229 || !draft.trim()) return
    event.preventDefault()
    event.stopPropagation()
    onTagsChange(addTags(tags, draft))
    onDraftChange('')
  }

  return <div className="grid gap-4 pt-2 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${id}-category`}>{t('category')}</Label>
      <Input id={`${id}-category`} list={`${id}-categories`} value={category} maxLength={MAX_CATEGORY} autoComplete="off"
        placeholder={t('categoryPlaceholder')} aria-describedby={`${id}-category-help`} className="h-11" onChange={event => onCategoryChange(event.target.value)} />
      <datalist id={`${id}-categories`}>{suggestions.categories.map(item => <option key={item.name} value={item.name} />)}</datalist>
      <p id={`${id}-category-help`} className="text-xs text-muted-foreground">{t('categoryHelp')}</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-tags`}>{t('tags')}</Label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
        {tags.length > 0 && <ul aria-label={t('tagList')} className="contents">
          {tags.map(tag => <li key={tag} className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full bg-secondary pr-0.5 pl-2.5 text-[13px] text-secondary-foreground">
            <span className="truncate">{tag}</span>
            <button type="button" aria-label={t('removeTag', { tag })} title={t('removeTag', { tag })}
              className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => onTagsChange(tags.filter(item => item !== tag))}><X className="size-3.5" aria-hidden="true" /></button>
          </li>)}
        </ul>}
        <input id={`${id}-tags`} list={`${id}-tag-options`} value={draft} maxLength={MAX_TAG} disabled={full} autoComplete="off"
          placeholder={full ? t('tagsFull', { max: MAX_TAGS }) : t('tagPlaceholder')} aria-describedby={`${id}-tags-help`}
          className="h-8 min-w-32 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
          onChange={event => changeDraft(event.target.value)} onKeyDown={handleKeyDown}
          onBlur={() => { if (draft.trim()) { onTagsChange(addTags(tags, draft)); onDraftChange('') } }} />
        <datalist id={`${id}-tag-options`}>
          {suggestions.tags.filter(item => !tags.some(tag => tag.toLocaleLowerCase() === item.name.toLocaleLowerCase())).map(item => <option key={item.name} value={item.name} />)}
        </datalist>
      </div>
      <p id={`${id}-tags-help`} className="text-xs text-muted-foreground">{t('tagsHelp', { max: MAX_TAGS })}</p>
    </div>
  </div>
}
