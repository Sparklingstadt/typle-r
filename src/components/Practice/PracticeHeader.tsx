"use client"
import { useTranslations } from "next-intl"
import { Brain, ChevronsUpDown, Eye, EyeOff, List, PanelRightClose, PanelRightOpen, RotateCcw } from "lucide-react"
import type { PracticeDevice } from "@/core/devices"
import type { PracticeMode } from "@/core/records"
import type { SavedWordList } from "@/core/wordLists"
import { Button } from "@/components/ui/button"
import PracticeName from "@/components/PracticeName"
import DeviceMenu from "./DeviceMenu"
import Kbd from "./Kbd"

export default function PracticeHeader({ list, listName, wordCount, devices, device, running, mode, finished, statsVisible, asideOpen, onOpenPicker, onChooseDevice, onDeviceMenuOpenChange, onDeviceMenuCloseAutoFocus, onSwitchRecall, onStatsVisibleChange, onAsideOpenChange, onFocusInput, onRestart }: {
  list: SavedWordList
  listName: string
  wordCount: number
  devices: PracticeDevice[]
  device?: PracticeDevice
  running: boolean
  mode: PracticeMode
  finished: boolean
  statsVisible: boolean
  asideOpen: boolean
  onOpenPicker: () => void
  onChooseDevice: (id: string) => void
  onDeviceMenuOpenChange: (open: boolean) => void
  onDeviceMenuCloseAutoFocus: (event: Event) => void
  onSwitchRecall: () => void
  onStatsVisibleChange: (visible: boolean) => void
  onAsideOpenChange: (open: boolean) => void
  onFocusInput: () => void
  onRestart: () => void
}) {
  const t = useTranslations('practice')
  const recall = mode === 'recall'
  return <div className="flex h-14 items-center gap-1.5 border-b px-2 sm:h-16 sm:gap-3 sm:px-3">
    <button type="button" onClick={onOpenPicker} aria-haspopup="dialog" aria-label={t('header.switchList', { name: listName })}
      className="flex h-10 min-w-0 items-center gap-2 rounded-lg px-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-2.5">
      <List className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
      <span className="truncate text-[15px] font-bold text-foreground sm:text-base"><PracticeName list={list} /></span>
      <span className="hidden shrink-0 text-[13px] sm:inline">{t('header.wordCount', { count: wordCount })}</span>
      <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
    </button>
    <span className="flex-1" />
    <DeviceMenu devices={devices} device={device} locked={running} onChange={onChooseDevice} onOpenChange={onDeviceMenuOpenChange} onCloseAutoFocus={onDeviceMenuCloseAutoFocus} />
    {/* Handwriting never combines with recall, so the recall switch is hidden while writing. */}
    {mode !== 'writing' && <Button variant="ghost" size="lg" className="shrink-0 px-2 sm:px-2.5" aria-pressed={recall} disabled={running} title={t('recall.toggle')} aria-label={t('recall.toggle')} onClick={onSwitchRecall}>
      <Brain aria-hidden="true" /><span className="hidden xl:inline">{t('recall.toggle')}</span>
    </Button>}
    {/* Hiding the live stats only changes the display: timing, saving and the result screen stay the same. */}
    <Button variant="ghost" size="icon-lg" className="shrink-0" aria-pressed={statsVisible} aria-label={t('header.liveStats')} title={t('header.liveStats')}
      onClick={() => { onStatsVisibleChange(!statsVisible); if (!finished) onFocusInput() }}>
      {statsVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
    </Button>
    {/* Only wide screens put the panel beside the card; below that it follows the card and stays shown. */}
    <Button variant="ghost" size="icon-lg" className="hidden shrink-0 lg:inline-flex" aria-pressed={asideOpen} aria-controls="practice-aside" aria-label={t('header.aside')} title={t('header.aside')}
      onClick={() => { onAsideOpenChange(!asideOpen); if (!finished) onFocusInput() }}>
      {asideOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
    </Button>
    <Button variant="ghost" size="lg" className="shrink-0 px-2 sm:px-2.5" onClick={onRestart} aria-label={t('header.restart')} aria-keyshortcuts="Escape" title={t('header.restartTitle')}>
      <RotateCcw aria-hidden="true" /><span className="hidden sm:inline">{t('header.restartShort')}</span><Kbd className="hidden sm:inline-flex">Esc</Kbd>
    </Button>
  </div>
}
