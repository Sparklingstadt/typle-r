import { useTranslations } from 'next-intl'
import type { Labels } from '@/core/listOverview'

const ALL = 'all'
const NONE = 'none'
const named = (name: string) => `category:${name}`

// Narrows the lists to choose from down to one category: null is every list and '' those without one. Left out while
// no list has a category.
export default function CategorySelect({ labels, value, onChange, className }: {
  labels: Labels
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}) {
  const t = useTranslations('wordLists.filter')
  if (!labels.categories.length && value === null) return null
  const current = value === null ? ALL : value === '' ? NONE : named(value)
  return <select aria-label={t('category')} value={current} className={className ?? 'h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'}
    onChange={event => {
      const next = event.target.value
      onChange(next === ALL ? null : next === NONE ? '' : next.slice(named('').length))
    }}>
    <option value={ALL}>{t('allCategories')}</option>
    {labels.categories.map(item => <option key={item.name} value={named(item.name)}>{t('option', { name: item.name, count: item.count })}</option>)}
    {value !== null && value !== '' && !labels.categories.some(item => item.name === value) && <option value={named(value)}>{value}</option>}
    {labels.uncategorized > 0 && <option value={NONE}>{t('option', { name: t('noCategory'), count: labels.uncategorized })}</option>}
  </select>
}
