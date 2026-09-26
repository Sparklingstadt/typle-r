'use client'

import { useState, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getResolvedSnapshot, setTheme, subscribe } from '@/lib/theme/store'

const getServerSnapshot = () => false

export default function ThemeSwitcher() {
  const dark = useSyncExternalStore(subscribe, getResolvedSnapshot, getServerSnapshot)
  const [saveFailed, setSaveFailed] = useState(false)
  return <div className="flex flex-col items-end gap-1">
    <Button
      variant="outline"
      size="icon"
      className="size-11"
      aria-label="ダークモード"
      aria-pressed={dark}
      title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      onClick={() => setSaveFailed(!setTheme(getResolvedSnapshot() ? 'light' : 'dark'))}
    >
      <Sun aria-hidden="true" className="size-5 dark:hidden" />
      <Moon aria-hidden="true" className="hidden size-5 dark:block" />
    </Button>
    {saveFailed && <p role="status" className="max-w-56 text-xs text-muted-foreground">設定を保存できないため、この画面内だけで切り替えます。</p>}
  </div>
}
