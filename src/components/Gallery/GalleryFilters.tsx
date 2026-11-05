import { useTranslations } from 'next-intl'
import { NativeSelect } from '@/components/ui/native-select'
import GallerySearchBox from '@/components/Gallery/GallerySearchBox'
import { GALLERY_SORTS, type GalleryCategory, type GalleryQuery, type GallerySort } from '@/core/gallery'

// The search and its filters. A category from the address stays a choice even when no pack has it any more.
export default function GalleryFilters({ query, categories, onChange }: { query: GalleryQuery; categories: GalleryCategory[]; onChange: (next: GalleryQuery) => void }) {
  const t = useTranslations('wordLists.gallery')
  const choices = query.category && !categories.some(category => category.name === query.category)
    ? [...categories, { name: query.category, count: 0 }] : categories
  return <div className="flex flex-wrap items-end gap-3">
    <GallerySearchBox key={query.text} text={query.text} onSearch={text => onChange({ ...query, text })} />
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('category')}
      <NativeSelect variant="compact" value={query.category} onChange={event => onChange({ ...query, category: event.target.value })}>
        <option value="">{t('allCategories')}</option>
        {choices.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
      </NativeSelect>
    </label>
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t('sort')}
      <NativeSelect variant="compact" value={query.sort} onChange={event => onChange({ ...query, sort: event.target.value as GallerySort })}>
        {GALLERY_SORTS.map(sort => <option key={sort} value={sort}>{sort === 'new' ? t('sortNew') : t('sortPopular')}</option>)}
      </NativeSelect>
    </label>
  </div>
}
