import { useTranslations } from 'next-intl'
import { NativeSelect } from '@/components/ui/native-select'
import type { listLabels } from '@/core/listOverview'

const ALL = 'all'
const NONE = 'none'
const named = (name: string) => `category:${name}`

// Narrows the lists to choose from down to one category: null is every list and '' those without one. Left out while
// no list has a category.
export default function CategorySelect({ labels, value, onChange, size = 'default' }: {
  labels: ReturnType<typeof listLabels>
  value: string | null
  onChange: (value: string | null) => void
  size?: 'default' | 'large'
}) {
  const t = useTranslations('wordLists.filter')
  if (!labels.categories.length && value === null) return null
  const current = value === null ? ALL : value === '' ? NONE : named(value)
  return <NativeSelect variant="filter" aria-label={t('category')} value={current} className={size === 'large' ? 'h-10' : undefined}
    onChange={event => {
      const next = event.target.value
      onChange(next === ALL ? null : next === NONE ? '' : next.slice(named('').length))
    }}>
    <option value={ALL}>{t('allCategories')}</option>
    {labels.categories.map(item => <option key={item.name} value={named(item.name)}>{t('option', { name: item.name, count: item.count })}</option>)}
    {value !== null && value !== '' && !labels.categories.some(item => item.name === value) && <option value={named(value)}>{value}</option>}
    {labels.uncategorized > 0 && <option value={NONE}>{t('option', { name: t('noCategory'), count: labels.uncategorized })}</option>}
  </NativeSelect>
}
