"use client"
import { useId, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronsUpDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { listLabels } from '@/core/listOverview'
import { MAX_CATEGORY, MAX_TAG, MAX_TAGS, normalizeLabels } from '@/core/wordLists'

// A comma (or 、 and ，) ends a tag, so a pasted "Go, CLI" becomes two.
const separators = /[,、，]/

/** The tags with `text` added: the separated parts, trimmed, unless already there in any case, up to MAX_TAGS. */
export function addTags(tags: string[], text: string) {
  return (normalizeLabels({ tags: [...tags, ...text.split(separators)] }).tags ?? []).slice(0, MAX_TAGS)
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

// A trigger button that opens a searchable list of the labels in use. Typing a name that is not there offers to create
// it, which also chooses it. The list is filtered here rather than by cmdk, so the item to create is always shown.
function LabelPicker({ id, open, onOpenChange, trigger, search, placeholder, maxLength, query, onQueryChange, children }: {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  search: string
  placeholder: string
  maxLength: number
  query: string
  onQueryChange: (value: string) => void
  children: ReactNode
}) {
  const t = useTranslations('wordLists.editor')
  return <Popover open={open} onOpenChange={value => { onOpenChange(value); if (!value) onQueryChange('') }}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-describedby={`${id}-help`}
        className="h-11 w-full justify-between px-3 font-normal">
        {trigger}
        <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    {/* Keys stay in the picker: the editor's form would otherwise take Enter to move on to the words. */}
    <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0" onKeyDown={event => event.stopPropagation()}>
      <Command shouldFilter={false}>
        <CommandInput aria-label={search} placeholder={placeholder} maxLength={maxLength} value={query} onValueChange={onQueryChange} />
        <CommandList>
          <CommandEmpty>{t('noLabels')}</CommandEmpty>
          {children}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}

// The category, chosen from those in use or created, and the tags, chosen or created in the same way and shown as chips.
export default function LabelFields({ category, tags, suggestions, onCategoryChange, onTagsChange }: {
  category: string
  tags: string[]
  suggestions: ReturnType<typeof listLabels>
  onCategoryChange: (value: string) => void
  onTagsChange: (value: string[]) => void
}) {
  const t = useTranslations('wordLists.editor')
  const id = useId()
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const full = tags.length >= MAX_TAGS
  const matches = (name: string, query: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

  const categories = suggestions.categories.filter(item => matches(item.name, categoryQuery))
  const newCategory = categoryQuery.trim() && !suggestions.categories.some(item => same(item.name, categoryQuery)) ? categoryQuery.trim() : ''
  function chooseCategory(value: string) {
    onCategoryChange(value)
    setCategoryOpen(false)
    setCategoryQuery('')
  }

  // Tags already on the list stay in the picker with a check, so choosing one again takes it off.
  const tagOptions = [...tags.filter(tag => !suggestions.tags.some(item => same(item.name, tag))).map(name => ({ name })), ...suggestions.tags]
    .filter(item => matches(item.name, tagQuery))
  const newTags = tagQuery.split(separators).map(part => part.trim()).filter(part => part && ![...tags, ...suggestions.tags.map(item => item.name)].some(name => same(name, part)))
  function toggleTag(name: string) {
    const chosen = tags.find(tag => same(tag, name))
    onTagsChange(chosen ? tags.filter(tag => tag !== chosen) : addTags(tags, name))
  }
  function createTags() {
    onTagsChange(addTags(tags, tagQuery))
    setTagQuery('')
  }

  return <div className="grid gap-4 pt-2 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor={`${id}-category`}>{t('category')}</Label>
      <LabelPicker id={`${id}-category`} open={categoryOpen} onOpenChange={setCategoryOpen} search={t('searchCategory')} placeholder={t('categoryPlaceholder')}
        maxLength={MAX_CATEGORY} query={categoryQuery} onQueryChange={setCategoryQuery}
        trigger={category.trim() ? <span className="truncate">{category}</span> : <span className="truncate text-muted-foreground">{t('chooseCategory')}</span>}>
        {categories.length > 0 && <CommandGroup>
          {categories.map(item => <CommandItem key={item.name} value={`category:${item.name}`} data-checked={same(item.name, category)}
            onSelect={() => chooseCategory(same(item.name, category) ? '' : item.name)}>
            <span className="truncate">{item.name}</span>
          </CommandItem>)}
        </CommandGroup>}
        {(newCategory || category.trim()) && <CommandGroup>
          {newCategory && <CommandItem value={`create:${newCategory}`} onSelect={() => chooseCategory(newCategory)}>
            <Plus aria-hidden="true" /><span className="truncate">{t('create', { name: newCategory })}</span>
          </CommandItem>}
          {category.trim() && <CommandItem value="clear" onSelect={() => chooseCategory('')}>
            <X aria-hidden="true" />{t('clearCategory')}
          </CommandItem>}
        </CommandGroup>}
      </LabelPicker>
      <p id={`${id}-category-help`} className="text-xs text-muted-foreground">{t('categoryHelp')}</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-tags`}>{t('tags')}</Label>
      <LabelPicker id={`${id}-tags`} open={tagsOpen} onOpenChange={setTagsOpen} search={t('searchTag')} placeholder={t('tagPlaceholder')}
        maxLength={MAX_TAG} query={tagQuery} onQueryChange={setTagQuery}
        trigger={<span className="truncate text-muted-foreground">{full ? t('tagsFull', { max: MAX_TAGS }) : t('addTag')}</span>}>
        {tagOptions.length > 0 && <CommandGroup>
          {tagOptions.map(item => {
            const chosen = tags.some(tag => same(tag, item.name))
            return <CommandItem key={item.name} value={`tag:${item.name}`} data-checked={chosen} disabled={full && !chosen} onSelect={() => toggleTag(item.name)}>
              <span className="truncate">{item.name}</span>
            </CommandItem>
          })}
        </CommandGroup>}
        {newTags.length > 0 && !full && <CommandGroup>
          <CommandItem value={`create:${tagQuery}`} onSelect={createTags}>
            <Plus aria-hidden="true" /><span className="truncate">{t('create', { name: newTags.join(', ') })}</span>
          </CommandItem>
        </CommandGroup>}
      </LabelPicker>
      {tags.length > 0 && <ul aria-label={t('tagList')} className="flex flex-wrap gap-1.5">
        {tags.map(tag => <li key={tag} className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full bg-secondary pr-0.5 pl-2.5 text-[13px] text-secondary-foreground">
          <span className="truncate">{tag}</span>
          <button type="button" aria-label={t('removeTag', { tag })} title={t('removeTag', { tag })}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => onTagsChange(tags.filter(item => item !== tag))}><X className="size-3.5" aria-hidden="true" /></button>
        </li>)}
      </ul>}
      <p id={`${id}-tags-help`} className="text-xs text-muted-foreground">{t('tagsHelp', { max: MAX_TAGS })}</p>
    </div>
  </div>
}
