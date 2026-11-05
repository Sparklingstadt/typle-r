import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// The typed text is applied on submit only; the box starts again (by its key) when the address brings other text.
export default function GallerySearchBox({ text, onSearch }: { text: string; onSearch: (text: string) => void }) {
  const t = useTranslations('wordLists.gallery')
  const [draft, setDraft] = useState(text)
  return <form role="search" className="flex min-w-60 flex-1 gap-2" onSubmit={event => { event.preventDefault(); onSearch(draft.trim()) }}>
    <Input type="search" aria-label={t('search')} value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} />
    <Button type="submit"><Search aria-hidden="true" />{t('search')}</Button>
  </form>
}
