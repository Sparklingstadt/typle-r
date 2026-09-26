'use client'

import { useState, useSyncExternalStore } from 'react'
import { getServerSnapshot, getSnapshot, setTheme, subscribe } from '@/lib/theme/store'
import { parseThemePreference } from '@/lib/theme/bootstrap'

export default function ThemeSwitcher() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [saveFailed, setSaveFailed] = useState(false)
  return <div className="flex flex-col items-end gap-1">
    <label className="flex items-center gap-2 text-sm">
      <span>テーマ</span>
      <select
        aria-label="カラーテーマ"
        value={preference}
        onChange={event => setSaveFailed(!setTheme(parseThemePreference(event.target.value)))}
        className="h-11 rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <option value="system">システム</option>
        <option value="light">ライト</option>
        <option value="dark">ダーク</option>
      </select>
    </label>
    {saveFailed && <p role="status" className="max-w-56 text-xs text-muted-foreground">設定を保存できないため、この画面内だけで切り替えます。</p>}
  </div>
}
