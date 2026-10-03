'use client'

import { useState, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { getResolvedSnapshot, setTheme, subscribe } from '@/lib/theme/store'

const getServerSnapshot = () => false

export default function ThemeSwitcher() {
  const dark = useSyncExternalStore(subscribe, getResolvedSnapshot, getServerSnapshot)
  const [saveFailed, setSaveFailed] = useState(false)
  const t = useTranslations('nav.theme')
  return <div className="relative">
    <Button
      variant="ghost"
      size="icon"
      className="size-10"
      aria-label={t('label')}
      aria-pressed={dark}
      title={t(dark ? 'toLight' : 'toDark')}
      onClick={() => setSaveFailed(!setTheme(getResolvedSnapshot() ? 'light' : 'dark'))}
    >
      <Sun aria-hidden="true" className="size-5 dark:hidden" />
      <Moon aria-hidden="true" className="hidden size-5 dark:block" />
    </Button>
    {saveFailed && <p role="status" className="absolute top-full right-0 z-50 mt-2 w-56 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md">{t('saveFailed')}</p>}
  </div>
}
